import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { updateStudentSchema } from "@/lib/validation/students";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();

    const { data: student, error } = await db
      .from("students")
      .select("id, code, full_name, created_at")
      .eq("id", id)
      .single();
    if (error || !student) return jsonError("Không tìm thấy thí sinh", 404);

    const { data: assignments, error: aErr } = await db
      .from("exam_assignments")
      .select("id, status, exams(id, name)")
      .eq("student_id", id);
    if (aErr) throw aErr;

    return NextResponse.json({ student, assignments: assignments ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const body = updateStudentSchema.parse(await req.json());
    const db = createAdminClient();

    const patch: { code?: string; full_name?: string | null } = {};
    if (body.code !== undefined) patch.code = body.code.toUpperCase();
    if (body.full_name !== undefined) patch.full_name = body.full_name;

    const { data, error } = await db
      .from("students")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        return jsonError("Mã số này đã được dùng bởi thí sinh khác", 409);
      }
      throw error;
    }
    return NextResponse.json({ student: data });
  } catch (err) {
    return handleApiError(err);
  }
}
