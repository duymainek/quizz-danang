import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { getCurrentTermId } from "@/lib/terms";

/** Mốc 00:00 hôm nay theo giờ Việt Nam (UTC+7), quy về thời điểm UTC tương ứng. */
function startOfTodayVN(): string {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const now = new Date();
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const startVNAsUTC = Date.UTC(
    vnNow.getUTCFullYear(),
    vnNow.getUTCMonth(),
    vnNow.getUTCDate(),
    0,
    0,
    0
  );
  return new Date(startVNAsUTC - VN_OFFSET_MS).toISOString();
}

export async function GET() {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const startOfToday = startOfTodayVN();
    const termId = await getCurrentTermId(db);

    // termExamIds (dùng ở khối chart bên dưới) không phụ thuộc kết quả của
    // 6 query đầu — gộp chung 1 Promise.all luôn, thay vì query riêng sau đó.
    const [
      totalExams,
      activeExams,
      inProgressSessions,
      submittedToday,
      violationsToday,
      activeExamRows,
      termExamsRes,
    ] = await Promise.all([
      db.from("exams").select("id", { count: "exact", head: true }).eq("term_id", termId),
      db
        .from("exams")
        .select("id", { count: "exact", head: true })
        .eq("term_id", termId)
        .eq("is_active", true),
      db
        .from("exam_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      db
        .from("exam_sessions")
        .select("id", { count: "exact", head: true })
        .in("status", ["submitted", "auto_submitted"])
        .gte("submitted_at", startOfToday),
      db
        .from("violation_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfToday),
      db
        .from("exams")
        .select("id, name, duration_minutes, exam_assignments(status)")
        .eq("term_id", termId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      db.from("exams").select("id").eq("term_id", termId),
    ]);

    for (const r of [
      totalExams,
      activeExams,
      inProgressSessions,
      submittedToday,
      violationsToday,
      activeExamRows,
      termExamsRes,
    ]) {
      if (r.error) throw r.error;
    }

    const activeExamsSummary = (activeExamRows.data ?? []).map((e) => {
      const assignments = (e.exam_assignments ?? []) as { status: string }[];
      return {
        id: e.id,
        name: e.name,
        duration_minutes: e.duration_minutes,
        total: assignments.length,
        in_progress: assignments.filter((a) => a.status === "in_progress").length,
        submitted: assignments.filter((a) => a.status === "submitted").length,
        unused: assignments.filter((a) => a.status === "unused" || a.status === "reset").length,
      };
    });

    // Sprint 2 — dữ liệu chart: lượt nộp 14 ngày + phân bố điểm + phiên gần nhất.
    const since14d = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const termExamIds = termExamsRes.data?.map((e) => e.id) ?? [];

    // Query từng bước, không embed nhiều tầng (dễ lỗi PostgREST khó debug).
    let recentSubmissionRows: { submitted_at: string | null }[] = [];
    let scoreRows: { total_score: number }[] = [];
    let sessionRows: {
      id: string;
      status: string;
      submitted_at: string | null;
      started_at: string | null;
      violation_count: number;
      exam_id: string;
      exam_assignment_id: string;
    }[] = [];
    let examNameById = new Map<string, string>();
    const studentByAssignment = new Map<string, { code: string; full_name: string | null }>();

    if (termExamIds.length > 0) {
      const [subsRes, sessionsRes, examsNameRes] = await Promise.all([
        db
          .from("exam_sessions")
          .select("submitted_at")
          .in("exam_id", termExamIds)
          .in("status", ["submitted", "auto_submitted"])
          .gte("submitted_at", since14d),
        db
          .from("exam_sessions")
          .select(
            "id, status, submitted_at, started_at, violation_count, exam_id, exam_assignment_id"
          )
          .in("exam_id", termExamIds)
          .order("created_at", { ascending: false })
          .limit(8),
        db.from("exams").select("id, name").in("id", termExamIds),
      ]);
      if (subsRes.error) throw subsRes.error;
      if (sessionsRes.error) throw sessionsRes.error;
      if (examsNameRes.error) throw examsNameRes.error;
      recentSubmissionRows = subsRes.data ?? [];
      sessionRows = sessionsRes.data ?? [];
      examNameById = new Map((examsNameRes.data ?? []).map((e) => [e.id, e.name]));

      // Điểm: lấy id session của khóa trước, rồi query scores theo session_id.
      // Tên/mã thí sinh của các phiên gần nhất chỉ cần assignmentIds đã có sẵn
      // từ sessionRows — độc lập với việc lấy session ids/scores, chạy song song.
      const assignmentIds = sessionRows.map((s) => s.exam_assignment_id);
      const [sessionIdsRes, assignmentsRes] = await Promise.all([
        db.from("exam_sessions").select("id").in("exam_id", termExamIds).eq("invalidated", false),
        assignmentIds.length > 0
          ? db.from("exam_assignments").select("id, students(code, full_name)").in("id", assignmentIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (sessionIdsRes.error) throw sessionIdsRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      const ids = (sessionIdsRes.data ?? []).map((s) => s.id);
      if (ids.length > 0) {
        const { data: scores, error: scErr } = await db
          .from("scores")
          .select("total_score, manual_score, session_id")
          .in("session_id", ids);
        if (scErr) throw scErr;
        scoreRows = (scores ?? []).map((s) => ({
          total_score: Number(
            (s as { manual_score: number | null }).manual_score ?? s.total_score
          ),
        }));
      }

      for (const a of assignmentsRes.data ?? []) {
        const st = a.students as unknown as { code: string; full_name: string | null } | null;
        if (st) studentByAssignment.set(a.id, st);
      }
    }

    // Gom lượt nộp theo ngày (giờ VN).
    const byDay = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000 + 7 * 3_600_000);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const s of recentSubmissionRows) {
      if (!s.submitted_at) continue;
      const key = new Date(new Date(s.submitted_at).getTime() + 7 * 3_600_000)
        .toISOString()
        .slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    const submissions_by_day = Array.from(byDay.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    // Histogram điểm theo khoảng 0-2, 2-4, ... 8-10 (thang mặc định 10).
    const buckets = [0, 0, 0, 0, 0];
    for (const s of scoreRows) {
      const v = Number(s.total_score ?? 0);
      buckets[Math.min(4, Math.max(0, Math.floor(v / 2)))]++;
    }
    const score_distribution = buckets.map((count, i) => ({
      range: `${i * 2}–${i * 2 + 2}`,
      count,
    }));

    const recent_sessions = sessionRows.map((s) => ({
      id: s.id,
      status: s.status,
      submitted_at: s.submitted_at,
      started_at: s.started_at,
      violation_count: s.violation_count,
      exam_name: examNameById.get(s.exam_id) ?? "",
      code: studentByAssignment.get(s.exam_assignment_id)?.code ?? "",
      full_name: studentByAssignment.get(s.exam_assignment_id)?.full_name ?? null,
    }));

    return NextResponse.json({
      submissions_by_day,
      score_distribution,
      recent_sessions,
      total_exams: totalExams.count ?? 0,
      active_exams: activeExams.count ?? 0,
      in_progress_sessions: inProgressSessions.count ?? 0,
      submitted_today: submittedToday.count ?? 0,
      violations_today: violationsToday.count ?? 0,
      active_exams_summary: activeExamsSummary,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
