import { NextResponse } from "next/server";
import { resolveExamSession } from "@/lib/exam/session-guard";
import { handleExamApiError } from "@/lib/api-helpers";
import { toPublicQuestions, type SnapshotQuestion } from "@/lib/exam/generate-snapshot";

export async function GET() {
  try {
    const { session, db } = await resolveExamSession();

    const snapshot = session.snapshot_questions as unknown as SnapshotQuestion[];

    const { data: answers } = await db
      .from("answers")
      .select("question_id, selected_options")
      .eq("session_id", session.id);

    const deadline =
      new Date(session.started_at).getTime() + session.exams.duration_minutes * 60_000;

    return NextResponse.json({
      status: session.status,
      started_at: session.started_at,
      deadline_at: new Date(deadline).toISOString(),
      exam_name: session.exams.name,
      max_violations: session.exams.max_violations,
      violation_count: session.violation_count,
      questions: toPublicQuestions(snapshot),
      answers: answers ?? [],
      student: session.student,
    });
  } catch (err) {
    return handleExamApiError(err);
  }
}
