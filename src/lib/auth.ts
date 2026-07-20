import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Trả về user admin hiện tại (đã qua middleware chặn nếu chưa login).
 * Vẫn tự check lại ở đây cho các nơi gọi trực tiếp ngoài luồng middleware
 * (defense in depth) và để lấy user.id phục vụ audit log (VD US-07 reset).
 */
export async function requireAdminUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Chưa đăng nhập hoặc phiên đã hết hạn");
  }
  return user;
}

export class AuthError extends Error {}
