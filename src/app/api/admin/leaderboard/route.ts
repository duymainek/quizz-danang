import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { getCurrentTermId } from "@/lib/terms";

/**
 * Leaderboard theo đề (Sprint 3): xếp hạng điểm giảm dần,
 * tie-break bằng thời gian làm bài tăng dần. Kèm số vi phạm.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);
    const examId = req.nextUrl.searchParams.get("exam_id");

    // Danh sách đề trong khóa (cho dropdown filter).
    const { data: exams, error: examsErr } = await db
      .from("exams")
      .select("id, name")
      .eq("term_id", termId)
      .order("created_at", { ascending: false });
    if (examsErr) throw examsErr;

    if (!examId) {
      return NextResponse.json({ exams: exams ?? [], rows: [] });
    }
    if (!(exams ?? []).some((e) => e.id === examId)) {
      return jsonError("Đề thi không thuộc khóa đang chọn", 422);
    }

    // Query 3 bước, không embed nhiều tầng (tránh lỗi PostgREST khó debug).
    const { data: sessions, error } = await db
      .from("exam_sessions")
      .select("id, started_at, submitted_at, violation_count, status, exam_assignment_id")
      .eq("exam_id", examId)
      .eq("invalidated", false) // bài bị hủy kết quả không lên bảng xếp hạng
      .in("status", ["submitted", "auto_submitted"]);
    if (error) throw error;

    const sessionIds = (sessions ?? []).map((s) => s.id);
    const assignmentIds = (sessions ?? []).map((s) => s.exam_assignment_id);

    const scoreBySession = new Map<string, number>();
    const studentByAssignment = new Map<
      string,
      { id: string; code: string; full_name: string | null; unit: string | null }
    >();
    if (sessionIds.length > 0) {
      const [scoresRes, assignmentsRes] = await Promise.all([
        db
          .from("scores")
          .select("session_id, total_score, manual_score")
          .in("session_id", sessionIds),
        db
          .from("exam_assignments")
          .select("id, students(id, code, full_name, unit)")
          .in("id", assignmentIds),
      ]);
      if (scoresRes.error) throw scoresRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      for (const s of scoresRes.data ?? []) {
        // Điểm sửa tay ưu tiên hơn điểm máy chấm.
        scoreBySession.set(s.session_id, Number(s.manual_score ?? s.total_score));
      }
      for (const a of assignmentsRes.data ?? []) {
        const st = a.students as unknown as {
          id: string;
          code: string;
          full_name: string | null;
          unit: string | null;
        } | null;
        if (st) studentByAssignment.set(a.id, st);
      }
    }

    const rows = (sessions ?? [])
      .map((s) => {
        const student = studentByAssignment.get(s.exam_assignment_id);
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
