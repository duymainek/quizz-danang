"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client phía trình duyệt cho admin dashboard — dùng ANON key +
 * cookie phiên đăng nhập hiện có. Chỉ dùng để subscribe Realtime (đọc),
 * KHÔNG dùng để ghi dữ liệu nghiệp vụ (luôn qua API routes/service role).
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
