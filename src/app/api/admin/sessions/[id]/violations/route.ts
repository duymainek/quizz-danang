import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: sessionId } = await params;
    idParamSchema.parse(sessionId);
    const db = createAdminClient();
    const { data, error } = await db
      .from("violation_logs")
      .select("id, type, created_at, dismissed")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ violations: data });
  } catch (err) {
    return handleApiError(err);
  }
}
