import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

/** Xem audit log — chỉ admin. Filter theo action/actor, phân trang đơn giản. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("admin");
    const db = createAdminClient();
    const q = req.nextUrl.searchParams;
    const page = Math.max(0, Number(q.get("page") ?? 0));
    const action = q.get("action")?.trim();
    const actor = q.get("actor")?.trim();
    const PAGE_SIZE = 50;

    let query = db
      .from("audit_logs")
      .select("id, actor_email, action, target_type, target_id, metadata, created_at", {
        count: "exact",
      })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (action) query = query.eq("action", action);
    if (actor) query = query.ilike("actor_email", `%${actor}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ rows: data ?? [], total: count ?? 0, page_size: PAGE_SIZE });
  } catch (err) {
    return handleApiError(err);
  }
}
