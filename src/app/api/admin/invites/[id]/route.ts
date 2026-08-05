import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

/**
 * Thu hồi link mời — dùng cho cả link chưa dùng (huỷ trước khi ai bấm) lẫn
 * link đã hết hạn/đã dùng (chỉ để dọn danh sách). Xoá thẳng khỏi admin_invites
 * thay vì set expires_at vì bảng không có cột "revoked" riêng.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { user } = await requireRole("admin");
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();

    const { data: invite, error: fetchErr } = await db
      .from("admin_invites")
      .select("id, email, role")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!invite) return jsonError("Không tìm thấy link mời này", 404);

    const { error } = await db.from("admin_invites").delete().eq("id", id);
    if (error) throw error;

    void db
      .from("audit_logs")
      .insert({
        actor_email: user.email ?? "unknown",
        action: "revoke_invite",
        target_type: "admin_invites",
        target_id: id,
        metadata: { email: invite.email, role: invite.role },
      })
      .then(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
