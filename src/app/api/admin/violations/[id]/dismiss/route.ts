import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";

/**
 * Bỏ qua 1 vi phạm oan (popup hệ điều hành, cuộc gọi đến...):
 * đánh dấu dismissed + giảm violation_count của phiên. Giám sát viên dùng được.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePermission("ops_day");
    const { id } = await params;
    const db = createAdminClient();

    const { data: v, error } = await db
      .from("violation_logs")
      .select("id, session_id, type, dismissed")
      .eq("id", id)
      .single();
    if (error || !v) return jsonError("Không tìm thấy bản ghi vi phạm", 404);
    if (v.dismissed) return jsonError("Vi phạm này đã được bỏ qua trước đó", 409);

    const { error: e1 } = await db
      .from("violation_logs")
      .update({
        dismissed: true,
        dismissed_by: user.email ?? "unknown",
        dismissed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (e1) throw e1;

    // Giảm violation_count nhưng không xuống dưới 0.
    const { data: session } = await db
      .from("exam_sessions")
      .select("violation_count")
      .eq("id", v.session_id)
      .single();
    if (session && session.violation_count > 0) {
      await db
        .from("exam_sessions")
        .update({ violation_count: session.violation_count - 1 })
        .eq("id", v.session_id);
    }

    await db.from("audit_logs").insert({
      actor_email: user.email ?? "unknown",
      action: "dismiss_violation",
      target_type: "violation_logs",
      target_id: id,
      metadata: { session_id: v.session_id, type: v.type },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
