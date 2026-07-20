import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { nameInputSchema, idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const body = nameInputSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("subjects")
      .update({ name: body.name })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ subject: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();
    const { error } = await db.from("subjects").delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        return jsonError(
          "Không thể xóa môn thi vì còn đề thi hoặc tệp câu hỏi liên quan",
          409
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
