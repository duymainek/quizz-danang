import { NextRequest, NextResponse } from "next/server";
import { resolveExamSession } from "@/lib/exam/session-guard";
import { handleExamApiError } from "@/lib/api-helpers";
import { eventSchema } from "@/lib/validation/exam-flow";

/**
 * Ghi log "âm thầm" phía thí sinh — chọn đáp án lần đầu, đổi đáp án, lưu
 * đáp án thất bại, nộp bài (attempt/success/error)... KHÔNG ảnh hưởng gì
 * tới điểm số hay trạng thái bài thi, chỉ để admin tra cứu lại khi có sự cố
 * mạng/khiếu nại. Vì vậy route này cố tình "khoan dung": không chặn nếu
 * session đã kết thúc (vẫn muốn ghi log submit_success sau khi status vừa
 * đổi thành submitted), và không throw lỗi nghiêm trọng nếu ghi log thất bại
 * — phía frontend luôn gọi kiểu "fire-and-forget", không chờ/không retry.
 */
export async function POST(req: NextRequest) {
  try {
    const body = eventSchema.parse(await req.json());
    const { session, db } = await resolveExamSession();

    const { error } = await db.from("session_events").insert({
      session_id: session.id,
      type: body.type,
      payload: body.payload,
      client_time: body.client_time ?? null,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleExamApiError(err);
  }
}
