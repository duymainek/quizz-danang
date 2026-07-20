import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();
    const { data, error } = await db
      .from("student_codes")
      .select("id, code, student_name, status, created_at")
      .eq("exam_id", id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ student_codes: data });
  } catch (err) {
    return handleApiError(err);
  }
}
