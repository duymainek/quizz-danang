import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { nameInputSchema } from "@/lib/validation/common";

export async function GET() {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const { data, error } = await db
      .from("subjects")
      .select("id, name, created_at, question_pools(count)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ subjects: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUser();
    const body = nameInputSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("subjects")
      .insert({ name: body.name })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ subject: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
