import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { resolveStudentSession } from "@/lib/student/session";

type AssignmentRow = {
  id: string;
  status: string;
  exam_id: string;
  exams: {
    name: string;
    duration_minutes: number;
    is_active: boolean;
    monitoring_enabled: boolean;
    publish_score: boolean;
  };
};

export async function GET() {
  try {
    const { student, db } = await resolveStudentSession();

    const { data: assignments, error } = await db
      .from("exam_assignments")
      .select(
        "id, status, exam_id, exams(name, duration_minutes, is_active, monitoring_enabled, publish_score)"
      )
      .eq("student_id", student.id);
    if (error) throw error;

    const rows = (assignments ?? []) as unknown as AssignmentRow[];
    const assignmentIds = rows.map((r) => r.id);

    // Lấy lượt thi gần nhất cho mỗi assignment (nếu có), rồi lấy điểm tương ứng —
    // truy vấn riêng thay vì embed sâu, theo đúng pattern đã dùng ở phần admin
    // vì PostgREST không đáng tin cậy với embed nhiều tầng qua bảng trung gian.
    const latestSessionByAssignment = new Map<
      string,
      { id: string; status: string; submitted_at: string | null }
    >();
    if (assignmentIds.length > 0) {
      const { data: sessions, error: sessionsErr } = await db
        .from("exam_sessions")
        .select("id, exam_assignment_id, status, submitted_at, created_at")
        .in("exam_assignment_id", assignmentIds)
        .order("created_at", { ascending: false });
      if (sessionsErr) throw sessionsErr;
      for (const s of sessions ?? []) {
        if (!latestSessionByAssignment.has(s.exam_assignment_id)) {
          latestSessionByAssignment.set(s.exam_assignment_id, {
            id: s.id,
            status: s.status,
            submitted_at: s.submitted_at,
          });
        }
      }
    }

    const sessionIds = Array.from(latestSessionByAssignment.values()).map((s) => s.id);
    const scoreBySessionId = new Map<string, number>();
    if (sessionIds.length > 0) {
      const { data: scores, error: scoresErr } = await db
        .from("scores")
        .select("session_id, total_score")
        .in("session_id", sessionIds);
      if (scoresErr) throw scoresErr;
      for (const s of scores ?? []) {
        scoreBySessionId.set(s.session_id, Number(s.total_score));
      }
    }

    const exams = rows.map((r) => {
      const latestSession = latestSessionByAssignment.get(r.id) ?? null;
      const publishScore = r.exams.publish_score;
      const score = latestSession ? scoreBySessionId.get(latestSession.id) ?? null : null;
      return {
        exam_id: r.exam_id,
        name: r.exams.name,
        duration_minutes: r.exams.duration_minutes,
        is_active: r.exams.is_active,
        monitoring_enabled: r.exams.monitoring_enabled,
        assignment_status: r.status,
        submitted_at: latestSession?.submitted_at ?? null,
        publish_score: publishScore,
        total_score: publishScore ? score : null,
      };
    });

    return NextResponse.json({
      student: { code: student.code, full_name: student.full_name },
      exams,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
