import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { questionInputSchema } from "@/lib/validation/question";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const poolId = req.nextUrl.searchParams.get("pool_id");
    if (!poolId) return jsonError("Thiếu pool_id", 400);

    const db = createAdminClient();
    const { data, error } = await db
      .from("questions")
      .select("*")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ questions: data });
  } catch (err) {
    return handleApiError(err);
  }
}

const createQuestionSchema = questionInputSchema.and(
  z.object({ pool_id: z.string().uuid("pool_id không hợp lệ") })
);

export async function POST(req: NextRequest) {
  try {
    await requirePermission("manage_questions");
    const raw = await req.json();
    const body = createQuestionSchema.parse(raw);
    const db = createAdminClient();
    const { data, error } = await db
      .from("questions")
      .insert({
        pool_id: body.pool_id,
        content: body.content,
        type: body.type,
        options: body.options,
        correct_answers: body.correct_answers,
        points: body.points,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ question: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
