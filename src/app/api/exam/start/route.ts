import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { loginSchema } from "@/lib/validation/exam-flow";
import {
  EXAM_COOKIE_NAME,
  buildCookieValue,
  generateOpaqueToken,
  hashToken,
} from "@/lib/exam/session-token";
import { generateExamSnapshot, toPublicQuestions } from "@/lib/exam/generate-snapshot";

export async function POST(req: NextRequest) {
  try {
    const { code } = loginSchema.parse(await req.json());
    const db = createAdminClient();
    const normalizedCode = code.toUpperCase();

    // UPDATE có điều kiện — Postgres tự đảm bảo atomic: nếu 2 request cùng
    // mã đến gần như đồng thời, chỉ 1 request nhận được row (race-safe),
    // request còn lại nhận 0 row và phải coi như "đã bắt đầu rồi".
    const { data: claimed, error: claimErr } = await db
      .from("student_codes")
      .update({ status: "in_progress" })
      .eq("code", normalizedCode)
      .in("status", ["unused", "reset"])
      .select("id, exam_id")
      .maybeSingle();
    if (claimErr) throw claimErr;

    if (!claimed) {
      // Không claim được — kiểm tra lý do để trả lỗi rõ ràng cho thí sinh.
      const { data: existing } = await db
        .from("student_codes")
        .select("status")
        .eq("code", normalizedCode)
        .maybeSingle();
      if (!existing) return jsonError("Mã số không đúng hoặc không tồn tại", 404);
      if (existing.status === "submitted") {
        return jsonError("Mã số này đã nộp bài, không thể bắt đầu lại", 409);
      }
      return jsonError(
        "Bài thi đã được bắt đầu (có thể do bấm 'Bắt đầu' 2 lần) — vui lòng vào lại bằng mã số để tiếp tục.",
        409
      );
    }

    let snapshot;
    try {
      snapshot = await generateExamSnapshot(claimed.exam_id);
    } catch (err) {
      // Compensate: trả mã về trạng thái unused vì không sinh được đề.
      await db.from("student_codes").update({ status: "unused" }).eq("id", claimed.id);
      throw err;
    }

    const { data: exam } = await db
      .from("exams")
      .select("duration_minutes")
      .eq("id", claimed.exam_id)
      .single();

    const token = generateOpaqueToken();
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const { data: session, error: sessionErr } = await db
      .from("exam_sessions")
      .insert({
        student_code_id: claimed.id,
        exam_id: claimed.exam_id,
        snapshot_questions: snapshot,
        session_token_hash: hashToken(token),
        started_at: new Date().toISOString(),
        status: "in_progress",
        ip_address: ip,
        user_agent: userAgent,
      })
      .select("id, started_at")
      .single();

    if (sessionErr) {
      await db.from("student_codes").update({ status: "unused" }).eq("id", claimed.id);
      throw sessionErr;
    }

    const cookieStore = await cookies();
    cookieStore.set(EXAM_COOKIE_NAME, buildCookieValue(session.id, token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: (exam?.duration_minutes ?? 60) * 60 + 3600,
    });

    return NextResponse.json({
      session_id: session.id,
      started_at: session.started_at,
      duration_minutes: exam?.duration_minutes ?? 60,
      questions: toPublicQuestions(snapshot),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
