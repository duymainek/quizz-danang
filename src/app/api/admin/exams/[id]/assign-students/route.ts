import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { assignStudentsSchema } from "@/lib/validation/students";

type Params = { params: Promise<{ id: string }> };

// Gán các thí sinh CÓ SẴN (đã tồn tại trong hệ thống, có thể đang thi đề khác)
// vào đề thi này — thay cho việc phải sinh mã mới thủ công từng lần.
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: examId } = await params;
    idParamSchema.parse(examId);
    const body = assignStudentsSchema.parse(await req.json());
    const db = createAdminClient();

    const { data: exam, error: examErr } = await db
      .from("exams")
      .select("id")
      .eq("id", examId)
      .single();
    if (examErr || !exam) return jsonError("Không tìm thấy đề thi", 404);

    const rows = body.student_ids.map((student_id) => ({
      exam_id: examId,
      student_id,
      status: "unused" as const,
    }));

    // Bỏ qua các cặp (exam_id, student_id) đã tồn tại — tránh lỗi trùng khi
    // admin lỡ chọn cả thí sinh đã được gán từ trước.
    const { data: before } = await db
      .from("exam_assignments")
      .select("student_id")
      .eq("exam_id", examId)
      .in("student_id", body.student_ids);
    const alreadyAssigned = new Set((before ?? []).map((r) => r.student_id));

    const newRows = rows.filter((r) => !alreadyAssigned.has(r.student_id));

    if (newRows.length > 0) {
      const { error: insErr } = await db.from("exam_assignments").insert(newRows);
      if (insErr) throw insErr;
    }

    return NextResponse.json({
      assigned: newRows.length,
      skipped: body.student_ids.length - newRows.length,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
