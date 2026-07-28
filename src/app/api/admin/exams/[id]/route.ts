import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { examInputSchema } from "@/lib/validation/exam";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();
    const { data, error } = await db
      .from("exams")
      .select(
        "*, exam_pool_configs(id, pool_id, num_questions_to_draw, question_pools(name, questions(count))), exam_assignments(status)"
      )
      .eq("id", id)
      .single();
    if (error) throw error;

    // Chỉ khóa sửa/xóa khi có mã ĐÃ ĐƯỢC DÙNG (đang thi/đã nộp) — mã vừa sinh
    // nhưng chưa ai dùng thì vẫn sửa thoải mái (VD admin đang test/chuẩn bị).
    const studentCodes = (data.exam_assignments ?? []) as { status: string }[];
    const usedCodesCount = studentCodes.filter(
      (c) => c.status === "in_progress" || c.status === "submitted"
    ).length;

    return NextResponse.json({
      exam: { ...data, student_codes_count: studentCodes.length, used_codes_count: usedCodesCount },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

async function assertNoStudentCodes(db: ReturnType<typeof createAdminClient>, examId: string) {
  const { count, error } = await db
    .from("exam_assignments")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .in("status", ["in_progress", "submitted"]);
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new EditBlockedError(
      "Không thể sửa/xóa đề thi này vì đã có thí sinh dùng mã số để thi (đang thi hoặc đã nộp). Hãy tạo đề mới nếu cần thay đổi cấu hình."
    );
  }
}

async function assertNoAnyStudentCodes(db: ReturnType<typeof createAdminClient>, examId: string) {
  const { count, error } = await db
    .from("exam_assignments")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new EditBlockedError(
      "Không thể xóa đề thi này vì đã có mã số thí sinh được sinh ra cho đề (kể cả mã chưa dùng). Xóa các mã số trước, hoặc tạo đề mới nếu cần cấu hình khác."
    );
  }
}

class EditBlockedError extends Error {}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePermission("manage_exams");
    const { id } = await params;
    idParamSchema.parse(id);
    const body = examInputSchema.parse(await req.json());
    const db = createAdminClient();

    await assertNoStudentCodes(db, id);

    const poolIds = body.pool_configs.map((c) => c.pool_id);
    const { data: pools, error: poolsErr } = await db
      .from("question_pools")
      .select("id, name, questions(count)")
      .in("id", poolIds);
    if (poolsErr) throw poolsErr;

    const poolById = new Map((pools ?? []).map((p) => [p.id, p]));
    for (const cfg of body.pool_configs) {
      const pool = poolById.get(cfg.pool_id);
      if (!pool) return jsonError(`Không tìm thấy tệp câu hỏi ${cfg.pool_id}`, 422);
      const available = pool.questions?.[0]?.count ?? 0;
      if (cfg.num_questions_to_draw > available) {
        return jsonError(
          `Tệp "${pool.name}" chỉ có ${available} câu, không thể rút ${cfg.num_questions_to_draw} câu`,
          422
        );
      }
    }

    const { data: exam, error: examErr } = await db
      .from("exams")
      .update({
        name: body.name,
        duration_minutes: body.duration_minutes,
        max_violations: body.max_violations,
        monitoring_enabled: body.monitoring_enabled,
        scoring_mode: body.scoring_mode,
        scale: body.scale,
        is_active: body.is_active,
        publish_score: body.publish_score,
      })
      .eq("id", id)
      .select()
      .single();
    if (examErr) throw examErr;

    const { error: delErr } = await db.from("exam_pool_configs").delete().eq("exam_id", id);
    if (delErr) throw delErr;

    const { error: insErr } = await db.from("exam_pool_configs").insert(
      body.pool_configs.map((c) => ({
        exam_id: id,
        pool_id: c.pool_id,
        num_questions_to_draw: c.num_questions_to_draw,
      }))
    );
    if (insErr) throw insErr;

    return NextResponse.json({ exam });
  } catch (err) {
    if (err instanceof EditBlockedError) return jsonError(err.message, 409);
    return handleApiError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requirePermission("manage_exams");
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();

    await assertNoAnyStudentCodes(db, id);

    const { error } = await db.from("exams").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EditBlockedError) return jsonError(err.message, 409);
    return handleApiError(err);
  }
}
