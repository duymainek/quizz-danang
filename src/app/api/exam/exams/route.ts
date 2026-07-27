import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

/**
 * API công khai (không cần đăng nhập) cho trang chọn đề thi của thí sinh.
 * CHỈ trả về các trường thông tin an toàn để hiển thị (tên đề, môn, thời
 * lượng, số câu, có giám sát hay không) — không trả câu hỏi, không trả mã
 * số, không trả gì liên quan tới ngân hàng câu hỏi. Chỉ liệt kê đề đang
 * is_active = true (đề nháp/đã đóng sẽ không hiện ra ở đây).
 */
export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("exams")
      .select(
        "id, name, duration_minutes, monitoring_enabled, exam_pool_configs(num_questions_to_draw)"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const exams = (data ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      duration_minutes: e.duration_minutes,
      monitoring_enabled: e.monitoring_enabled,
      total_questions: (e.exam_pool_configs ?? []).reduce(
        (sum: number, c: { num_questions_to_draw: number }) => sum + c.num_questions_to_draw,
        0
      ),
    }));

    return NextResponse.json({ exams });
  } catch (err) {
    return handleApiError(err);
  }
}
