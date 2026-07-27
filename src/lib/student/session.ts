import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { STUDENT_COOKIE_NAME, hashToken, parseCookieValue } from "@/lib/exam/session-token";

export class StudentSessionError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Đọc cookie định danh thí sinh ở /portal — khác với EXAM_COOKIE_NAME (gắn với
 * 1 lượt thi cụ thể). Đây là phiên "biết mình là ai", dùng chung cho mọi đề.
 */
export async function resolveStudentSession(): Promise<{
  student: { id: string; code: string; full_name: string | null };
  db: ReturnType<typeof createAdminClient>;
}> {
  const cookieStore = await cookies();
  const parsed = parseCookieValue(cookieStore.get(STUDENT_COOKIE_NAME)?.value);
  if (!parsed) throw new StudentSessionError("Chưa đăng nhập, vui lòng nhập lại mã số");

  const db = createAdminClient();
  const { data: student, error } = await db
    .from("students")
    .select("id, code, full_name, portal_token_hash")
    .eq("id", parsed.sessionId)
    .single();
  if (error || !student) throw new StudentSessionError("Không tìm thấy thí sinh");

  if (!student.portal_token_hash || hashToken(parsed.token) !== student.portal_token_hash) {
    throw new StudentSessionError("Phiên đăng nhập đã hết hạn, vui lòng nhập lại mã số");
  }

  return {
    student: { id: student.id, code: student.code, full_name: student.full_name },
    db,
  };
}
