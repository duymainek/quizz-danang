import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { CONFIG_DEFAULTS, getConfigWithSource, setConfig } from "@/lib/config";
import { getCurrentTermId } from "@/lib/terms";

/**
 * P7 — API settings cascade.
 * GET  ?exam_id=...        → toàn bộ key + giá trị hiệu lực + nguồn (scope exam)
 * GET  (không param)       → scope term đang chọn
 * PUT  {key, value, scope: "system"|"term"|"exam", exam_id?} → set/xóa override (value=null)
 */

const putSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  scope: z.enum(["system", "term", "exam"]),
  exam_id: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);
    const examId = req.nextUrl.searchParams.get("exam_id");
    const keys = Object.keys(CONFIG_DEFAULTS);
    const config = await getConfigWithSource(db, keys, {
      termId,
      examId: examId ?? undefined,
    });
    return NextResponse.json({ config, term_id: termId });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole("admin");
    const body = putSchema.parse(await req.json());
    if (!(body.key in CONFIG_DEFAULTS)) {
      return jsonError(`Key cấu hình không hợp lệ: ${body.key}`, 422);
    }
    if (body.scope === "exam" && !body.exam_id) {
      return jsonError("Thiếu exam_id cho scope exam", 422);
    }
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);
    await setConfig(db, body.key, body.value ?? null, {
      termId: body.scope === "term" ? termId : undefined,
      examId: body.scope === "exam" ? body.exam_id : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
