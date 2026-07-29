import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const TERM_COOKIE = "admin_term_id";

export type ExamTerm = {
  id: string;
  name: string;
  year: number;
  status: "draft" | "active" | "archived";
  created_at: string;
};

/**
 * Khóa thi đang chọn của admin (P0): đọc từ cookie; nếu không có/không hợp lệ
 * thì fallback về khóa active mới nhất. Mọi API admin đều scope theo khóa này.
 */
export async function getCurrentTermId(db: SupabaseClient): Promise<string> {
  const store = await cookies();
  const fromCookie = store.get(TERM_COOKIE)?.value ?? null;
  // RPC gộp fallback chain (cookie -> active -> latest) thành 1 round-trip
  // thay vì tối đa 3 query tuần tự.
  const { data, error } = await db.rpc("get_current_term_id", {
    p_cookie_id: fromCookie,
  });
  if (error) throw error;
  if (!data) throw new Error("Chưa có khóa thi nào trong hệ thống");
  return data as string;
}
