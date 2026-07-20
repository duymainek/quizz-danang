import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. CHỈ được import trong code chạy trên server
 * (Route Handlers, Server Actions, Server Components). "server-only" sẽ làm
 * build fail nếu file này lỡ bị import vào bundle client.
 *
 * Bypass toàn bộ RLS — mọi kiểm tra quyền (admin đã login, thí sinh đúng
 * session...) phải tự làm ở tầng API trước khi gọi client này.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong env"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
