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
  const fromCookie = store.get(TERM_COOKIE)?.value;
  if (fromCookie) {
    const { data } = await db
      .from("exam_terms")
      .select("id")
      .eq("id", fromCookie)
      .maybeSingle();
    if (data) return data.id;
  }
  const { data: active, error } = await db
    .from("exam_terms")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (active) return active.id;
  // Không còn khóa active nào — lấy khóa mới nhất bất kỳ.
  const { data: latest, error: latestErr } = await db
    .from("exam_terms")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (latestErr) throw latestErr;
  return latest.id;
}
