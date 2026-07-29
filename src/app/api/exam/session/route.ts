import { NextResponse } from "next/server";
import { resolveExamSession } from "@/lib/exam/session-guard";
import { handleExamApiError } from "@/lib/api-helpers";
import { toPublicQuestions, type SnapshotQuestion } from "@/lib/exam/generate-snapshot";
import { getConfig } from "@/lib/config";

export async function GET() {
  try {
    const { session, db } = await resolveExamSession();

    const snapshot = session.snapshot_questions as unknown as SnapshotQuestion[];

    // answers và checkin_enabled không phụ thuộc lẫn nhau — chạy song song.
    const [{ data: answers }, checkinEnabled] = await Promise.all([
      db.from("answers").select("question_id, selected_options").eq("session_id", session.id),
      // Check-in QR khi rời phòng: chỉ áp dụng cho nộp bài chủ động, không áp
      // dụng khi hết giờ/bị auto-submit do vi phạm (client tự bỏ qua bước này).
      getConfig<boolean>(db, "exit_checkin_enabled", {
        termId: session.exams.term_id,
        examId: session.exam_id,
      }),
    ]);

    const deadline =
      new Date(session.started_at).getTime() +
      (session.exams.duration_minutes + (session.extra_minutes ?? 0)) * 60_000;

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
      checkin_enabled: checkinEnabled === true,
    });
  } catch (err) {
    return handleExamApiError(err);
  }
}
