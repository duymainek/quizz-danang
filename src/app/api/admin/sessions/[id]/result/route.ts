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
        "id, started_at, submitted_at, status, violation_count, exam_assignment_id, exams(name, duration_minutes)"
      )
      .eq("id", sessionId)
      .single();
    if (sessionErr || !session) return jsonError("Không tìm thấy lượt thi", 404);

    // Thông tin thí sinh (qua exam_assignment_id) và điểm (qua sessionId) không
    // phụ thuộc lẫn nhau — cả 2 id đều đã có sẵn trước đó — chạy song song.
    const [assignmentRes, scoreRes] = await Promise.all([
      db
        .from("exam_assignments")
        .select("students(code, full_name)")
        .eq("id", session.exam_assignment_id)
        .single(),
      db.from("scores").select("total_score, detail").eq("session_id", sessionId).maybeSingle(),
    ]);
    const student = (assignmentRes.data?.students ?? null) as unknown as {
      code: string;
      full_name: string | null;
    } | null;
    if (scoreRes.error) throw scoreRes.error;
    const score = scoreRes.data;

    // Cột numeric trả về dạng string qua PostgREST — ép kiểu Number trước khi trả về frontend.
    const normalizedScore = score ? { ...score, total_score: Number(score.total_score) } : null;

    return NextResponse.json({
      session: {
        ...session,
        student_codes: { code: student?.code ?? "", student_name: student?.full_name ?? null },
      },
      score: normalizedScore,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
