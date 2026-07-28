import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { getCurrentTermId } from "@/lib/terms";

/** Sprint 3 — Nhân bản đề thi: copy cấu hình + pool configs, KHÔNG copy thí sinh/kết quả. */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("manage_exams");
    const { id } = await params;
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);

    const { data: src, error: srcErr } = await db
      .from("exams")
      .select("*, exam_pool_configs(pool_id, num_questions_to_draw)")
      .eq("id", id)
      .single();
    if (srcErr) throw srcErr;
    if (!src) return jsonError("Không tìm thấy đề thi", 404);

    const { data: exam, error: examErr } = await db
      .from("exams")
      .insert({
        term_id: termId, // nhân bản vào khóa đang chọn (cho phép copy đề từ khóa cũ)
        name: `${src.name} (bản sao)`,
        duration_minutes: src.duration_minutes,
        max_violations: src.max_violations,
        monitoring_enabled: src.monitoring_enabled,
        scoring_mode: src.scoring_mode,
        scale: src.scale,
        is_active: false, // bản sao luôn tạo ở trạng thái đóng
        publish_score: src.publish_score,
      })
      .select()
      .single();
    if (examErr) throw examErr;

    const configs = (src.exam_pool_configs ?? []) as {
      pool_id: string;
      num_questions_to_draw: number;
    }[];
    if (configs.length > 0) {
      const { error: cfgErr } = await db.from("exam_pool_configs").insert(
        configs.map((c) => ({
          exam_id: exam.id,
          pool_id: c.pool_id,
          num_questions_to_draw: c.num_questions_to_draw,
        }))
      );
      if (cfgErr) {
        await db.from("exams").delete().eq("id", exam.id);
        throw cfgErr;
      }
    }

    return NextResponse.json({ exam }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
