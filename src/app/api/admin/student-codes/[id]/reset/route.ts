import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();

    const { data: studentCode, error: codeErr } = await db
      .from("student_codes")
      .select("id, code, status")
      .eq("id", id)
      .single();
    if (codeErr || !studentCode) return jsonError("Không tìm thấy mã số thí sinh", 404);

    if (studentCode.status === "unused") {
      return jsonError("Mã số này chưa được sử dụng, không cần reset", 400);
    }

    // Đánh dấu lượt thi đang chạy (nếu có) là 'reset' — KHÔNG xóa, giữ lại
    // để phục vụ audit/khiếu nại sau này (xem mục 14.6 trong implementation-plan.md).
    const { error: sessionErr } = await db
      .from("exam_sessions")
      .update({ status: "reset" })
      .eq("exam_assignment_id", id)
      .eq("status", "in_progress");
    if (sessionErr) throw sessionErr;

    const { data: updatedCode, error: updateErr } = await db
      .from("student_codes")
      .update({ status: "unused" })
      .eq("id", id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    await db.from("audit_logs").insert({
      actor_email: admin.email ?? "unknown",
      action: "reset_student_code",
      target_type: "student_codes",
      target_id: id,
      metadata: { code: studentCode.code, previous_status: studentCode.status },
    });

    return NextResponse.json({ student_code: updatedCode });
  } catch (err) {
    return handleApiError(err);
  }
}
