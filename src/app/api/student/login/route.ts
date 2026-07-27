import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { studentLoginSchema } from "@/lib/validation/student";
import {
  STUDENT_COOKIE_NAME,
  buildCookieValue,
  generateOpaqueToken,
  hashToken,
} from "@/lib/exam/session-token";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  try {
    const { code } = studentLoginSchema.parse(await req.json());
    const db = createAdminClient();

    const { data: student, error } = await db
      .from("students")
      .select("id, code, full_name")
      .eq("code", code.trim().toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!student) return jsonError("Không tìm thấy mã số này, vui lòng kiểm tra lại", 404);

    const token = generateOpaqueToken();
    const { error: updateErr } = await db
      .from("students")
      .update({ portal_token_hash: hashToken(token) })
      .eq("id", student.id);
    if (updateErr) throw updateErr;

    const cookieStore = await cookies();
    cookieStore.set(STUDENT_COOKIE_NAME, buildCookieValue(student.id, token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });

    return NextResponse.json({
      student: { code: student.code, full_name: student.full_name },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
