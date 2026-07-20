import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: sessionId } = await params;
    idParamSchema.parse(sessionId);
    const db = createAdminClient();

    const { data: session, error: sessionErr } = await db
      .from("exam_sessions")
      .select(
        "id, started_at, submitted_at, status, violation_count, student_codes(code, student_name), exams(name, duration_minutes)"
      )
      .eq("id", sessionId)
      .single();
    if (sessionErr || !session) return jsonError("Không tìm thấy lượt thi", 404);

    const { data: score, error: scoreErr } = await db
      .from("scores")
      .select("total_score, detail")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (scoreErr) throw scoreErr;

    // Cột numeric trả về dạng string qua PostgREST — ép kiểu Number trước khi trả về frontend.
    const normalizedScore = score ? { ...score, total_score: Number(score.total_score) } : null;

    return NextResponse.json({ session, score: normalizedScore });
  } catch (err) {
    return handleApiError(err);
  }
}
