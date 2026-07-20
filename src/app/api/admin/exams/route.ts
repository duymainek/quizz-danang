import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { examInputSchema } from "@/lib/validation/exam";

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const subjectId = req.nextUrl.searchParams.get("subject_id");
    const db = createAdminClient();

    let query = db
      .from("exams")
      .select(
        "id, subject_id, name, duration_minutes, max_violations, monitoring_enabled, is_active, created_at, subjects(name), exam_pool_configs(num_questions_to_draw), student_codes(count)"
      )
      .order("created_at", { ascending: false });

    if (subjectId) query = query.eq("subject_id", subjectId);

    const { data, error } = await query;
    if (error) throw error;

    const exams = (data ?? []).map((e) => ({
      ...e,
      total_questions: (e.exam_pool_configs ?? []).reduce(
        (sum: number, c: { num_questions_to_draw: number }) => sum + c.num_questions_to_draw,
        0
      ),
      student_codes_count: e.student_codes?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ exams });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminUser();
    const body = examInputSchema.parse(await req.json());
    const db = createAdminClient();

    // Xác thực từng pool thuộc đúng subject và số câu rút không vượt quá số câu có trong pool.
    const poolIds = body.pool_configs.map((c) => c.pool_id);
    const { data: pools, error: poolsErr } = await db
      .from("question_pools")
      .select("id, subject_id, name, questions(count)")
      .in("id", poolIds);
    if (poolsErr) throw poolsErr;

    const poolById = new Map((pools ?? []).map((p) => [p.id, p]));
    for (const cfg of body.pool_configs) {
      const pool = poolById.get(cfg.pool_id);
      if (!pool) return jsonError(`Không tìm thấy tệp câu hỏi ${cfg.pool_id}`, 422);
      if (pool.subject_id !== body.subject_id) {
        return jsonError(
          `Tệp "${pool.name}" không thuộc môn thi đã chọn`,
          422
        );
      }
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
      .insert({
        subject_id: body.subject_id,
        name: body.name,
        duration_minutes: body.duration_minutes,
        max_violations: body.max_violations,
        monitoring_enabled: body.monitoring_enabled,
        scoring_mode: body.scoring_mode,
        scale: body.scale,
        is_active: body.is_active,
      })
      .select()
      .single();
    if (examErr) throw examErr;

    const { error: configsErr } = await db.from("exam_pool_configs").insert(
      body.pool_configs.map((c) => ({
        exam_id: exam.id,
        pool_id: c.pool_id,
        num_questions_to_draw: c.num_questions_to_draw,
      }))
    );
    if (configsErr) {
      // Compensate: xóa đề vừa tạo vì cấu hình rút câu ghi thất bại giữa chừng.
      await db.from("exams").delete().eq("id", exam.id);
      throw configsErr;
    }

    return NextResponse.json({ exam }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
