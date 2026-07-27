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
import { scoreSession } from "@/lib/exam/scoring";

export async function POST(req: NextRequest) {
  try {
    const { exam_id } = examEntrySchema.parse(await req.json());
    const { student } = await resolveStudentSession();
    const db = createAdminClient();

    // Danh tính thí sinh đến từ cookie /portal (student_session), không còn
    // nhập lại mã số mỗi đề — 1 thí sinh có thể được gán vào nhiều đề khác nhau.
    const { data: assignment, error } = await db
      .from("exam_assignments")
      .select(
        "id, status, exam_id, exams(name, duration_minutes, max_violations, monitoring_enabled, is_active, exam_pool_configs(num_questions_to_draw))"
      )
      .eq("exam_id", exam_id)
      .eq("student_id", student.id)
      .maybeSingle();

    if (error) throw error;
    if (!assignment) {
      return jsonError("Bạn chưa được gán vào đề thi này", 404);
    }

    const exam = assignment.exams as unknown as {
      name: string;
      duration_minutes: number;
      max_violations: number;
      monitoring_enabled: boolean;
      is_active: boolean;
      exam_pool_configs: { num_questions_to_draw: number }[];
    };
    const totalQuestions = exam.exam_pool_configs.reduce(
      (sum, c) => sum + c.num_questions_to_draw,
      0
    );
    const examSummary = {
      name: exam.name,
      duration_minutes: exam.duration_minutes,
      max_violations: exam.max_violations,
      monitoring_enabled: exam.monitoring_enabled,
      total_questions: totalQuestions,
    };
    const studentSummary = { code: student.code, student_name: student.full_name };

    if (assignment.status === "submitted") {
      return NextResponse.json({ phase: "submitted" });
    }

    if (assignment.status === "unused" || assignment.status === "reset") {
      // Đề đã bị admin đóng (is_active=false) sau khi được gán — chặn bắt đầu
      // lượt mới, nhưng không ảnh hưởng ai đang thi dở (nhánh in_progress bên
      // dưới không bị chặn bởi is_active).
      if (!exam.is_active) {
        return jsonError(
          "Đề thi này hiện chưa mở hoặc đã đóng, vui lòng liên hệ giám thị",
          403
        );
      }
      return NextResponse.json({ phase: "waiting", exam: examSummary, student: studentSummary });
    }

    // status === 'in_progress': tìm session đang chạy để cấp lại token (resume sau reload/mất mạng).
    const { data: session, error: sessionErr } = await db
      .from("exam_sessions")
      .select("id, started_at, status")
      .eq("exam_assignment_id", assignment.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionErr) throw sessionErr;

    if (!session || session.status !== "in_progress") {
      return NextResponse.json({ phase: "waiting", exam: examSummary, student: studentSummary });
    }

    const startedAt = new Date(session.started_at).getTime();
    const deadline = startedAt + exam.duration_minutes * 60_000;
    if (Date.now() > deadline) {
      await scoreSession(session.id);
      await db
        .from("exam_sessions")
        .update({ status: "auto_submitted", submitted_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "in_progress");
      await db.from("exam_assignments").update({ status: "submitted" }).eq("id", assignment.id);
      return NextResponse.json({ phase: "submitted" });
    }

    const token = generateOpaqueToken();
    const { error: updateErr } = await db
      .from("exam_sessions")
      .update({ session_token_hash: hashToken(token) })
      .eq("id", session.id);
    if (updateErr) throw updateErr;

    const cookieStore = await cookies();
    cookieStore.set(EXAM_COOKIE_NAME, buildCookieValue(session.id, token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: exam.duration_minutes * 60 + 3600,
    });

    return NextResponse.json({ phase: "in_progress", exam: examSummary, student: studentSummary });
  } catch (err) {
    return handleApiError(err);
  }
}
