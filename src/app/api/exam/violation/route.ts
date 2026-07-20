import { NextRequest, NextResponse } from "next/server";
import { resolveExamSession } from "@/lib/exam/session-guard";
import { handleExamApiError } from "@/lib/api-helpers";
import { violationSchema } from "@/lib/validation/exam-flow";
import { scoreSession } from "@/lib/exam/scoring";

export async function POST(req: NextRequest) {
  try {
    const body = violationSchema.parse(await req.json());
    const { session, db } = await resolveExamSession();

    if (session.status !== "in_progress") {
      // Bài đã kết thúc — bỏ qua, không báo lỗi (có thể là request trễ do mạng chậm).
      return NextResponse.json({ ok: true, status: session.status });
    }

    await db.from("violation_logs").insert({ session_id: session.id, type: body.type });

    const { data: incremented, error: incErr } = await db.rpc(
      "increment_violation_count",
      { p_session_id: session.id }
    );
    if (incErr) throw incErr;

    const newCount = (incremented as unknown as number) ?? session.violation_count + 1;
    const maxViolations = session.exams.max_violations;

    // max_violations = 0 → vi phạm đầu tiên auto-submit ngay.
    // max_violations > 0 → vượt quá ngưỡng mới auto-submit.
    const shouldAutoSubmit =
      maxViolations === 0 ? newCount >= 1 : newCount > maxViolations;

    if (shouldAutoSubmit) {
      await scoreSession(session.id);
      await db
        .from("exam_sessions")
        .update({ status: "auto_submitted", submitted_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "in_progress");
      await db
        .from("student_codes")
        .update({ status: "submitted" })
        .eq("id", session.student_code_id);

      return NextResponse.json({
        violation_count: newCount,
        remaining: 0,
        auto_submitted: true,
      });
    }

    return NextResponse.json({
      violation_count: newCount,
      remaining: Math.max(0, maxViolations - newCount),
      auto_submitted: false,
    });
  } catch (err) {
    return handleExamApiError(err);
  }
}
