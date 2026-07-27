import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

// Public — hiển thị quy chế dự thi ở /landing, không cần đăng nhập.
export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("app_settings")
      .select("rules_text")
      .eq("id", true)
      .single();
    if (error) throw error;
    return NextResponse.json({ rules_text: data?.rules_text ?? "" });
  } catch (err) {
    return handleApiError(err);
  }
}
