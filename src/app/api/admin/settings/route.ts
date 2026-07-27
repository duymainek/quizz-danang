import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

const updateSettingsSchema = z.object({
  rules_text: z.string().max(20000),
});

export async function GET() {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const { data, error } = await db
      .from("app_settings")
      .select("rules_text, updated_at")
      .eq("id", true)
      .single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminUser();
    const body = updateSettingsSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("app_settings")
      .update({ rules_text: body.rules_text, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("rules_text, updated_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (err) {
    return handleApiError(err);
  }
}
