import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { questionInputSchema } from "@/lib/validation/question";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const body = questionInputSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("questions")
      .update({
        content: body.content,
        type: body.type,
        options: body.options,
        correct_answers: body.correct_answers,
        points: body.points,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ question: data });
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
    const { error } = await db.from("questions").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
