import { NextResponse } from "next/server";
import { resolveExamSession } from "@/lib/exam/session-guard";
import { handleExamApiError } from "@/lib/api-helpers";
import { scoreSession } from "@/lib/exam/scoring";

export async function POST() {
  try {
    const { session, db } = await resolveExamSession();

    if (session.status !== "in_progress") {
      // Idempotent: đã nộp (chủ động, hết giờ, hay vi phạm) rồi thì trả ok luôn,
      // không báo lỗi — tránh thí sinh bấm nộp nhiều lần do mạng chậm bị confuse.
      return NextResponse.json({ ok: true, status: session.status });
    }

    await scoreSession(session.id);

    const { error } = await db
      .from("exam_sessions")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("status", "in_progress");
    if (error) throw error;

    await db
      .from("student_codes")
      .update({ status: "submitted" })
      .eq("id", session.student_code_id);

    return NextResponse.json({ ok: true, status: "submitted" });
  } catch (err) {
    return handleExamApiError(err);
  }
}
