import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

const createPoolSchema = z.object({
  name: z.string().trim().min(1, "Tên tệp không được để trống").max(200),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const db = createAdminClient();

    let query = db
      .from("question_pools")
      .select("id, name, created_at, questions(count)")
      .order("created_at", { ascending: false });

    if (q) query = query.ilike("name", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ pools: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("manage_questions");
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
