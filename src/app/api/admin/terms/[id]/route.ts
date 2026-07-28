import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { TERM_COOKIE } from "@/lib/terms";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  // select=true → chỉ chuyển khóa đang chọn (set cookie), không sửa dữ liệu.
  select: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminUser();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());
    const db = createAdminClient();

    if (body.select) {
      const { data, error } = await db
        .from("exam_terms")
        .select("id")
        .eq("id", id)
        .single();
      if (error) throw error;
      const res = NextResponse.json({ current_term_id: data.id });
      res.cookies.set(TERM_COOKIE, data.id, { path: "/", httpOnly: true, sameSite: "lax" });
      return res;
    }

    // Đổi khóa đang chọn (select) thì supervisor cũng được; sửa khóa thì không.
    await requireRole("admin");
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.year !== undefined) updates.year = body.year;
    if (body.status !== undefined) updates.status = body.status;
    const { data, error } = await db
      .from("exam_terms")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ term: data });
  } catch (err) {
    return handleApiError(err);
  }
}
