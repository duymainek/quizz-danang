import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { batchGenerateSchema } from "@/lib/validation/student-codes";
import { generateStudentCode } from "@/lib/code-generator";

type Params = { params: Promise<{ id: string }> };

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: examId } = await params;
    idParamSchema.parse(examId);
    const body = batchGenerateSchema.parse(await req.json());

    if (body.names && body.names.length > 0 && body.names.length !== body.count) {
      return jsonError(
        `Số dòng tên (${body.names.length}) phải khớp số lượng mã cần sinh (${body.count})`,
        422
      );
    }

    const db = createAdminClient();

    const { data: exam, error: examErr } = await db
      .from("exams")
      .select("id")
      .eq("id", examId)
      .single();
    if (examErr || !exam) return jsonError("Không tìm thấy đề thi", 404);

    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const codesSet = new Set<string>();
      while (codesSet.size < body.count) {
        codesSet.add(generateStudentCode());
      }
      const codes = Array.from(codesSet);

      const rows = codes.map((code, i) => ({
        code,
        exam_id: examId,
        student_name: body.names?.[i] || null,
      }));

      const { data, error } = await db.from("student_codes").insert(rows).select();

      if (!error) {
        return NextResponse.json({ student_codes: data }, { status: 201 });
      }

      if (error.code === "23505") {
        // Trùng với mã đã tồn tại trong DB (xác suất cực thấp) — sinh lại toàn bộ batch và thử lại.
        lastError = error;
        continue;
      }
      throw error;
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Không thể sinh mã số do trùng lặp liên tục, vui lòng thử lại");
  } catch (err) {
    return handleApiError(err);
  }
}
