import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { createStudentSchema } from "@/lib/validation/students";
import { generateStudentCode } from "@/lib/code-generator";
import { getCurrentTermId } from "@/lib/terms";

const MAX_ATTEMPTS = 5;

export async function GET(req: NextRequest) {
  try {
    await requireAdminUser();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const codesParam = req.nextUrl.searchParams.get("codes")?.trim();
    const db = createAdminClient();

    const termId = await getCurrentTermId(db);
    let query = db
      .from("students")
      .select("id, code, full_name, created_at, exam_assignments(count)")
      .eq("term_id", termId)
      .order("created_at", { ascending: false });

    if (codesParam) {
      // Tra cứu chính xác theo danh sách mã (dùng khi admin dán 1 danh sách
      // mã số để gán hàng loạt) — ưu tiên hơn tìm mờ theo q.
      const codes = codesParam
        .split(/[\s,]+/)
        .map((c) => c.trim().toUpperCase())
        .filter((c) => c.length > 0);
      if (codes.length === 0) return NextResponse.json({ students: [] });
      query = query.in("code", codes);
    } else if (q) {
      // Tìm theo mã số hoặc tên — không phân biệt hoa thường.
      query = query.or(`code.ilike.%${q}%,full_name.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const students = (data ?? []).map((s) => ({
      id: s.id,
      code: s.code,
      full_name: s.full_name,
      created_at: s.created_at,
      exam_count: s.exam_assignments?.[0]?.count ?? 0,
    }));

    return NextResponse.json({ students });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requirePermission("manage_students");
    const body = createStudentSchema.parse(await req.json());
    const db = createAdminClient();

    const termId = await getCurrentTermId(db);
    if (body.code) {
      const code = body.code.toUpperCase();
      const { data, error } = await db
        .from("students")
        .insert({ code, full_name: body.full_name ?? null, birth_year: body.birth_year ?? null, unit: body.unit ?? null, term_id: termId })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          return jsonError(`Mã số "${code}" đã tồn tại, vui lòng chọn mã khác`, 409);
        }
        throw error;
      }
      return NextResponse.json({ student: data }, { status: 201 });
    }

    // Không chỉ định mã — tự sinh mã ngẫu nhiên, thử lại nếu trùng (xác suất cực thấp).
    let lastError: unknown = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = generateStudentCode();
      const { data, error } = await db
        .from("students")
        .insert({ code, full_name: body.full_name ?? null, birth_year: body.birth_year ?? null, unit: body.unit ?? null, term_id: termId })
        .select()
        .single();
      if (!error) return NextResponse.json({ student: data }, { status: 201 });
      if (error.code === "23505") {
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
