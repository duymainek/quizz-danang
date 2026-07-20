import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";

const createPoolSchema = z.object({
  subject_id: z.string().uuid("subject_id không hợp lệ"),
  name: z.string().trim().min(1, "Tên tệp không được để trống").max(200),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const subjectId = req.nextUrl.searchParams.get("subject_id");
    if (!subjectId) return jsonError("Thiếu subject_id", 400);

    const db = createAdminClient();
    const { data, error } = await db
      .from("question_pools")
      .select("id, subject_id, name, created_at, questions(count)")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ pools: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUser();
    const body = createPoolSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("question_pools")
      .insert(body)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ pool: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
