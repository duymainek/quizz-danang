import { NextRequest, NextResponse } from "next/server";
import { resolveExamSession, ExamSessionError } from "@/lib/exam/session-guard";
import { handleExamApiError } from "@/lib/api-helpers";
import { answerSchema } from "@/lib/validation/exam-flow";
import type { SnapshotQuestion } from "@/lib/exam/generate-snapshot";

export async function PATCH(req: NextRequest) {
  try {
    const body = answerSchema.parse(await req.json());
    const { session, db } = await resolveExamSession();

    if (session.status !== "in_progress") {
      throw new ExamSessionError(
        "Bài thi đã kết thúc, không thể lưu thêm đáp án",
        409
      );
    }

    const snapshot = session.snapshot_questions as unknown as SnapshotQuestion[];
    const question = snapshot.find((q) => q.id === body.question_id);
    if (!question) {
      throw new ExamSessionError("Câu hỏi không thuộc về đề thi của bạn", 400);
    }
    const maxIndex = question.options.length - 1;
    if (body.selected_options.some((i) => i > maxIndex)) {
      throw new ExamSessionError("Lựa chọn không hợp lệ", 400);
    }

    const { error } = await db.from("answers").upsert(
      {
        session_id: session.id,
        question_id: body.question_id,
        selected_options: body.selected_options,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,question_id" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleExamApiError(err);
  }
}
