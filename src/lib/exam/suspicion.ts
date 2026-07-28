import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * P6 — Silent anti-abuse: gắn cờ nghi vấn (jsonb array) lên hồ sơ thí sinh
 * hoặc bài thi. KHÔNG bao giờ trả cờ này về phía thí sinh; chỉ admin thấy.
 * Mọi hàm ở đây nuốt lỗi — silent detection không được phép làm hỏng luồng chính.
 */

/** Cookie định danh thiết bị (đặt lúc student login, so khớp lúc check-in). */
export const DEVICE_COOKIE_NAME = "qz_device";

export type SuspicionFlag =
  | "multi_device"        // 1 SBD đăng nhập trên ≥2 thiết bị
  | "parallel_session"    // hoạt động từ 2 nơi cùng lúc
  | "device_mismatch"     // check-in bằng thiết bị khác thiết bị làm bài
  | "no_checkin"          // nộp bài nhưng không check-in tại phòng
  | "checkin_invalid";    // quét token hết hạn/không hợp lệ nhiều lần

async function appendFlag(
  db: SupabaseClient,
  table: "students" | "exam_sessions",
  id: string,
  flag: SuspicionFlag,
  detail?: Record<string, unknown>
) {
  try {
    const { data } = await db.from(table).select("suspicion_flags").eq("id", id).single();
    const flags: { flag: string; at: string; detail?: unknown }[] = Array.isArray(
      data?.suspicion_flags
    )
      ? data.suspicion_flags
      : [];
    // Không lặp cùng loại cờ quá 1 lần/giờ để tránh spam.
    const recent = flags.find(
      (f) => f.flag === flag && Date.now() - new Date(f.at).getTime() < 3_600_000
    );
    if (recent) return;
    flags.push({ flag, at: new Date().toISOString(), ...(detail ? { detail } : {}) });
    await db.from(table).update({ suspicion_flags: flags }).eq("id", id);
  } catch {
    // silent
  }
}

export function flagStudent(
  db: SupabaseClient,
  studentId: string,
  flag: SuspicionFlag,
  detail?: Record<string, unknown>
) {
  return appendFlag(db, "students", studentId, flag, detail);
}

export function flagSession(
  db: SupabaseClient,
  sessionId: string,
  flag: SuspicionFlag,
  detail?: Record<string, unknown>
) {
  return appendFlag(db, "exam_sessions", sessionId, flag, detail);
}
