import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { updateStudentCodeSchema } from "@/lib/validation/student-codes";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const body = updateStudentCodeSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("student_codes")
      .update({ student_name: body.student_name })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ student_code: data });
  } catch (err) {
    return handleApiError(err);
  }
}
