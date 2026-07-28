import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminUser, requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { getCurrentTermId, TERM_COOKIE } from "@/lib/terms";

const createTermSchema = z.object({
  name: z.string().trim().min(1).max(200),
  year: z.number().int().min(2000).max(2100),
});

export async function GET() {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const [{ data, error }, currentTermId] = await Promise.all([
      db
        .from("exam_terms")
        .select("id, name, year, status, created_at")
        .order("created_at", { ascending: false }),
      getCurrentTermId(createAdminClient()),
    ]);
    if (error) throw error;
    return NextResponse.json({ terms: data ?? [], current_term_id: currentTermId });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("admin");
    const body = createTermSchema.parse(await req.json());
    const db = createAdminClient();
    const { data, error } = await db
      .from("exam_terms")
      .insert({ name: body.name, year: body.year, status: "active" })
      .select()
      .single();
    if (error) throw error;
    // Tạo khóa mới → chuyển admin sang khóa đó luôn.
    const res = NextResponse.json({ term: data }, { status: 201 });
    res.cookies.set(TERM_COOKIE, data.id, { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
