import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { getCurrentTermId } from "@/lib/terms";

type Student = { id: string; code: string; full_name: string | null; unit: string | null };
type SessionRow = {
  id: string;
  started_at: string;
  submitted_at: string | null;
  violation_count: number;
  status: string;
  created_at: string;
  invalidated: boolean;
};

/**
 * Leaderboard theo đề (Sprint 3): xếp hạng điểm giảm dần,
 * tie-break bằng thời gian làm bài tăng dần. Kèm số vi phạm.
 *
 * scope=term: xếp hạng TOÀN KHÓA — cộng dồn điểm của thí sinh trên tất cả
 * các đề đã có điểm trong khóa, thay vì chỉ xem từng đề riêng lẻ.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);
    const examId = req.nextUrl.searchParams.get("exam_id");
    const scope = req.nextUrl.searchParams.get("scope");

    // Danh sách đề trong khóa (cho dropdown filter).
    const { data: exams, error: examsErr } = await db
      .from("exams")
      .select("id, name")
      .eq("term_id", termId)
      .order("created_at", { ascending: false });
    if (examsErr) throw examsErr;

    if (scope === "term") {
      return NextResponse.json({
        exams: exams ?? [],
        rows: await buildTermLeaderboard(db, (exams ?? []).map((e) => e.id)),
      });
    }

    if (!examId) {
      return NextResponse.json({ exams: exams ?? [], rows: [] });
    }
    if (!(exams ?? []).some((e) => e.id === examId)) {
      return jsonError("Đề thi không thuộc khóa đang chọn", 422);
    }

    // Lấy theo exam_assignments (1 thí sinh = 1 assignment/đề) rồi chỉ giữ
    // LƯỢT THI MỚI NHẤT của mỗi assignment — giống hệt logic đã dùng ở
    // /results và /results/export. Nếu không làm vậy, thí sinh bị admin reset
    // để thi lại (lượt cũ vẫn giữ nguyên status 'submitted' để phục vụ audit,
    // chỉ có assignment được mở lại) sẽ bị tính 2 lần trên bảng xếp hạng.
    const { data: assignments, error } = await db
      .from("exam_assignments")
      .select(
        "id, students(id, code, full_name, unit), exam_sessions!exam_sessions_exam_assignment_id_fkey(id, started_at, submitted_at, violation_count, status, created_at, invalidated)"
      )
      .eq("exam_id", examId);
    if (error) throw error;

    // Với mỗi assignment, chỉ xét session được TẠO GẦN NHẤT (lượt thi cuối
    // cùng) — bất kể trạng thái — rồi mới lọc theo điều kiện lên bảng xếp hạng.
    const latestByAssignment = (assignments ?? [])
      .map((a) => {
        const sessions = (a.exam_sessions ?? []) as SessionRow[];
        const latest = sessions.sort(
          (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
        )[0];
        const student = (a.students as unknown as Student | null) ?? null;
        return { assignmentId: a.id, student, latest };
      })
      .filter(
        (a) =>
          a.latest &&
          !a.latest.invalidated &&
          (a.latest.status === "submitted" || a.latest.status === "auto_submitted")
      );

    const sessionIds = latestByAssignment.map((a) => a.latest!.id);
    const scoreBySession = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: scores, error: scoresErr } = await db
        .from("scores")
        .select("session_id, total_score, manual_score")
        .in("session_id", sessionIds);
      if (scoresErr) throw scoresErr;
      for (const s of scores ?? []) {
        // Điểm sửa tay ưu tiên hơn điểm máy chấm.
        scoreBySession.set(s.session_id, Number(s.manual_score ?? s.total_score));
      }
    }

    const rows = latestByAssignment
      .map(({ student, latest }) => {
        const s = latest!;
        const durationMs =
          s.started_at && s.submitted_at
            ? new Date(s.submitted_at).getTime() - new Date(s.started_at).getTime()
            : null;
        return {
          session_id: s.id,
          student_id: student?.id ?? null,
          code: student?.code ?? "",
          full_name: student?.full_name ?? null,
          unit: student?.unit ?? null,
          total_score: scoreBySession.get(s.id) ?? null,
          duration_seconds: durationMs !== null ? Math.round(durationMs / 1000) : null,
          violation_count: s.violation_count,
          auto_submitted: s.status === "auto_submitted",
        };
      })
      .filter((r) => r.total_score !== null)
      .sort((a, b) => {
        if (b.total_score! !== a.total_score!) return b.total_score! - a.total_score!;
        return (a.duration_seconds ?? Infinity) - (b.duration_seconds ?? Infinity);
      })
      .map((r, i) => ({ rank: i + 1, ...r }));

    return NextResponse.json({ exams: exams ?? [], rows });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * Xếp hạng TOÀN KHÓA — cộng dồn điểm của thí sinh trên mọi đề đã có điểm
 * trong khóa (không phải trung bình, vì các đề có thể khác thang điểm/độ
 * khó — cộng dồn phản ánh đúng "làm càng nhiều đề càng chứng tỏ năng lực
 * toàn diện", giống cách nhiều kỳ thi HLV tính tổng điểm các môn).
 * Dùng lại đúng logic "chỉ lấy lượt thi mới nhất/hợp lệ mỗi assignment" như
 * nhánh theo-đề ở trên, áp dụng cho TẤT CẢ đề trong khóa cùng lúc.
 */
async function buildTermLeaderboard(
  db: ReturnType<typeof createAdminClient>,
  examIds: string[]
) {
  if (examIds.length === 0) return [];

  // Embed thẳng "scores" vào từng session thay vì query .in("session_id",
  // [...]) riêng — cả khóa có thể có 100+ thí sinh × 6 đề = 700+ session,
  // vượt giới hạn ~16KB header của PostgREST khi truyền qua URL GET (đã gặp
  // lỗi HeadersOverflowError với chỉ 457 ID ở dashboard tổng quan).
  const { data: assignments, error } = await db
    .from("exam_assignments")
    .select(
      "id, exam_id, students(id, code, full_name, unit), exam_sessions!exam_sessions_exam_assignment_id_fkey(id, started_at, submitted_at, violation_count, status, created_at, invalidated, scores(total_score, manual_score))"
    )
    .in("exam_id", examIds);
  if (error) throw error;

  const latestByAssignment = (assignments ?? [])
    .map((a) => {
      const sessions = (a.exam_sessions ?? []) as unknown as (SessionRow & {
        scores: { total_score: number; manual_score: number | null } | null;
      })[];
      const latest = sessions.sort(
        (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
      )[0];
      const student = (a.students as unknown as Student | null) ?? null;
      return { examId: a.exam_id as string, student, latest };
    })
    .filter(
      (a) =>
        a.latest &&
        !a.latest.invalidated &&
        (a.latest.status === "submitted" || a.latest.status === "auto_submitted")
    );

  const scoreBySession = new Map<string, number>();
  for (const { latest } of latestByAssignment) {
    // scores.session_id có unique constraint -> PostgREST trả OBJECT chứ
    // không phải mảng.
    if (latest?.scores) scoreBySession.set(latest.id, Number(latest.scores.manual_score ?? latest.scores.total_score));
  }

  type Agg = {
    student: Student | null;
    total_score: number;
    duration_seconds: number;
    violation_count: number;
    exams_completed: number;
    auto_submitted_count: number;
  };
  const byStudent = new Map<string, Agg>();

  for (const { student, latest } of latestByAssignment) {
    const s = latest!;
    const score = scoreBySession.get(s.id);
    if (score === undefined || !student) continue;
    const durationSeconds =
      s.started_at && s.submitted_at
        ? Math.round((new Date(s.submitted_at).getTime() - new Date(s.started_at).getTime()) / 1000)
        : 0;

    const cur = byStudent.get(student.id) ?? {
      student,
      total_score: 0,
      duration_seconds: 0,
      violation_count: 0,
      exams_completed: 0,
      auto_submitted_count: 0,
    };
    cur.total_score += score;
    cur.duration_seconds += durationSeconds;
    cur.violation_count += s.violation_count;
    cur.exams_completed += 1;
    if (s.status === "auto_submitted") cur.auto_submitted_count += 1;
    byStudent.set(student.id, cur);
  }

  return Array.from(byStudent.values())
    .sort((a, b) => {
      if (b.total_score !== a.total_score) return b.total_score - a.total_score;
      return a.duration_seconds - b.duration_seconds;
    })
    .map((r, i) => ({
      rank: i + 1,
      student_id: r.student!.id,
      code: r.student!.code,
      full_name: r.student!.full_name,
      unit: r.student!.unit,
      total_score: r.total_score,
      duration_seconds: r.duration_seconds,
      violation_count: r.violation_count,
      exams_completed: r.exams_completed,
      auto_submitted: r.auto_submitted_count > 0,
    }));
}
