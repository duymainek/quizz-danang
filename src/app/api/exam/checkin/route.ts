import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { resolveStudentSession, StudentSessionError } from "@/lib/student/session";
import { DEVICE_COOKIE_NAME, flagSession, flagStudent } from "@/lib/exam/suspicion";

const schema = z.object({ token: z.string().min(8).max(64) });

/**
 * P6 — Thí sinh quét QR check-in sau khi nộp bài, bằng CHÍNH thiết bị đã làm bài.
 * Mọi kết quả bất thường đều được ghi nhận SILENT — phản hồi cho thí sinh luôn
 * thân thiện, không tiết lộ cờ nghi vấn.
 */
export async function POST(req: NextRequest) {
  try {
    const { token } = schema.parse(await req.json());
    const { student, db } = await resolveStudentSession();
    const cookieStore = await cookies();
    const deviceId = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null;

    // 1. Token hợp lệ + còn hạn?
    const { data: tokenRow, error: tokenErr } = await db
      .from("checkin_tokens")
      .select("exam_id, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (tokenErr) throw tokenErr;
    if (!tokenRow || new Date(tokenRow.expires_at).getTime() < Date.now()) {
      // Token hết hạn (QR bị chụp gửi ra ngoài?) — ghi nhận silent.
      void flagStudent(db, student.id, "checkin_invalid", { token_expired: true });
      return jsonError("Mã QR đã hết hiệu lực, vui lòng quét lại mã trên màn hình", 410);
    }
    const examId = tokenRow.exam_id;

    // 2 & 3. Tìm phiên thi + thiết bị đăng nhập gần nhất — 2 truy vấn độc lập
    // (không cái nào cần kết quả của cái kia), chạy song song.
    const [{ data: session }, { data: lastLogin }] = await Promise.all([
      db
        .from("exam_sessions")
        .select(
          "id, status, assignment:exam_assignments!exam_sessions_exam_assignment_id_fkey!inner(student_id)"
        )
        .eq("exam_id", examId)
        .eq("assignment.student_id", student.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("login_events")
        .select("device_id")
        .eq("student_id", student.id)
        .eq("success", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const deviceMatched =
      !!deviceId && !!lastLogin?.device_id && deviceId === lastLogin.device_id;

    // 4. Ghi check-in (idempotent theo unique exam+student).
    const { error: insErr } = await db.from("checkins").upsert(
      {
        exam_id: examId,
        student_id: student.id,
        session_id: session?.id ?? null,
        device_id: deviceId,
        device_matched: deviceMatched,
      },
      { onConflict: "exam_id,student_id" }
    );
    if (insErr) throw insErr;

    // 5. Silent flags — không lộ gì trong response.
    if (!deviceMatched) {
      void flagStudent(db, student.id, "device_mismatch", { exam_id: examId });
      if (session) void flagSession(db, session.id, "device_mismatch");
    }

    return NextResponse.json({
      ok: true,
      message: "Check-in thành công. Bạn có thể rời phòng thi.",
    });
  } catch (err) {
    if (err instanceof StudentSessionError) {
      return jsonError("Vui lòng đăng nhập bằng mã số của bạn trước khi check-in", 401);
    }
    return handleApiError(err);
  }
}
