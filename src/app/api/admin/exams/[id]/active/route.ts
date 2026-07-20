import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ is_active: z.boolean() });

/**
 * Bật/tắt trạng thái hoạt động của đề thi — cố tình tách riêng khỏi PATCH
 * cấu hình đề (route "../route.ts") vì không nên bị khóa bởi điều kiện
 * "đã có mã đang thi/đã nộp". Admin cần đóng đề (is_active=false) bất cứ
 * lúc nào để chặn thí sinh mới vào, kể cả khi đề đang có người thi dở.
 * Việc tắt active KHÔNG ảnh hưởng thí sinh đang thi giữa chừng — chỉ chặn
 * lượt bắt đầu mới (xem /api/exam/login, /api/exam/start).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const body = bodySchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("exams")
      .update({ is_active: body.is_active })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ exam: data });
  } catch (err) {
    return handleApiError(err);
  }
}
