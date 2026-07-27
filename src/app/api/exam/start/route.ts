import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { examEntrySchema } from "@/lib/validation/exam-flow";
import { resolveStudentSession } from "@/lib/student/session";
import {
  EXAM_COOKIE_NAME,
  buildCookieValue,
  generateOpaqueToken,
  hashToken,
} from "@/lib/exam/session-token";
import { generateExamSnapshot, toPublicQuestions } from "@/lib/exam/generate-snapshot";

export async function POST(req: NextRequest) {
  try {
    const { exam_id } = examEntrySchema.parse(await req.json());
    const { student } = await resolveStudentSession();
    const db = createAdminClient();

    const { data: exam, error: examErr } = await db
      .from("exams")
      .select("duration_minutes, is_active")
      .eq("id", exam_id)
      .single();
    if (examErr || !exam) return jsonError("Không tìm thấy đề thi", 404);
    if (!exam.is_active) {
      return jsonError(
        "Đề thi này hiện chưa mở hoặc đã đóng, vui lòng liên hệ giám thị",
        403
      );
    }

    // UPDATE có điều kiện — Postgres tự đảm bảo atomic: nếu 2 request cùng
    // thí sinh đến gần như đồng thời, chỉ 1 request nhận được row (race-safe).
    const { data: claimed, error: claimErr } = await db
      .from("exam_assignments")
      .update({ status: "in_progress" })
      .eq("exam_id", exam_id)
      .eq("student_id", student.id)
      .in("status", ["unused", "reset"])
      .select("id, exam_id")
      .maybeSingle();
    if (claimErr) throw claimErr;

    if (!claimed) {
      const { data: existing } = await db
        .from("exam_assignments")
        .select("status")
        .eq("exam_id", exam_id)
        .eq("student_id", student.id)
        .maybeSingle();
      if (!existing) return jsonError("Bạn chưa được gán vào đề thi này", 404);
      if (existing.status === "submitted") {
        return jsonError("Bạn đã nộp bài đề thi này, không thể bắt đầu lại", 409);
      }
      return jsonError(
        "Bài thi đã được bắt đầu (có thể do bấm 'Bắt đầu' 2 lần) — vui lòng vào lại để tiếp tục.",
        409
      );
    }

    let snapshot;
    try {
      snapshot = await generateExamSnapshot(claimed.exam_id);
    } catch (err) {
      // Compensate: trả assignment về trạng thái unused vì không sinh được đề.
      await db.from("exam_assignments").update({ status: "unused" }).eq("id", claimed.id);
      throw err;
    }

    const token = generateOpaqueToken();
    const ip = req.headers.get("x-forwarded-for") ?? "unknown";
    const userAgent = req.headers.get("user-agent") ?? "unknown";

    const { data: session, error: sessionErr } = await db
      .from("exam_sessions")
      .insert({
        exam_assignment_id: claimed.id,
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
      await db.from("exam_assignments").update({ status: "unused" }).eq("id", claimed.id);
      throw sessionErr;
    }

    const cookieStore = await cookies();
    cookieStore.set(EXAM_COOKIE_NAME, buildCookieValue(session.id, token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: exam.duration_minutes * 60 + 3600,
    });

    return NextResponse.json({
      session_id: session.id,
      started_at: session.started_at,
      duration_minutes: exam.duration_minutes,
      questions: toPublicQuestions(snapshot),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
