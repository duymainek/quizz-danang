import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Supabase client dùng ANON key, gắn với cookie phiên đăng nhập của admin
 * (Supabase Auth). Dùng để xác thực "ai đang gọi API", KHÔNG dùng để
 * đọc/ghi dữ liệu nghiệp vụ (vì RLS deny-all, anon key không đọc được gì) —
 * đọc/ghi dữ liệu luôn qua admin.ts (service role) sau khi đã xác thực ở đây.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component gọi setAll — bỏ qua, middleware sẽ refresh cookie.
        }
      },
    },
  });
}
