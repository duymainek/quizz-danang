import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

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

    const [
      totalExams,
      activeExams,
      inProgressSessions,
      submittedToday,
      violationsToday,
      activeExamRows,
    ] = await Promise.all([
      db.from("exams").select("id", { count: "exact", head: true }),
      db.from("exams").select("id", { count: "exact", head: true }).eq("is_active", true),
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
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
    ]);

    for (const r of [
      totalExams,
      activeExams,
      inProgressSessions,
      submittedToday,
      violationsToday,
      activeExamRows,
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

    return NextResponse.json({
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
