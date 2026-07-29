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

    // RPC gộp: đánh dấu dismissed (chỉ khi chưa dismissed — idempotent) + giảm
    // violation_count bằng 1 UPDATE trực tiếp trong SQL, không cần đọc trước
    // rồi ghi lại. Trước đây là 3 round-trip tuần tự (đọc, update, đọc lại,
    // update), giờ còn 1.
    const { data: rpcData, error } = await db
      .rpc("dismiss_violation", { p_violation_id: id, p_actor: user.email ?? "unknown" })
      .maybeSingle();
    if (error) throw error;
    const data = rpcData as { session_id: string; type: string; session_status: string } | null;
    if (!data || !data.session_id) {
      return jsonError("Không tìm thấy bản ghi vi phạm hoặc đã được bỏ qua trước đó", 404);
    }

    // Ghi audit log không chặn response — best-effort, giống pattern đã dùng
    // ở checkin/route.ts và student/login/route.ts.
    void db
      .from("audit_logs")
      .insert({
        actor_email: user.email ?? "unknown",
        action: "dismiss_violation",
        target_type: "violation_logs",
        target_id: id,
        metadata: { session_id: data.session_id, type: data.type },
      })
      .then(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
