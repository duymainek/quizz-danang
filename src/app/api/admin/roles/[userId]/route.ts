import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ userId: string }> };

/**
 * Xoá 1 thành viên khỏi admin_roles — thu hồi quyền admin/supervisor đã cấp.
 * Không xoá tài khoản Supabase Auth, chỉ gỡ row phân quyền: tài khoản không
 * còn row trong admin_roles sẽ mặc định coi là "admin" (theo getAdminRole),
 * nên xoá xong cần báo rõ hệ quả này cho người dùng ở UI.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { user } = await requireRole("admin");
    const { userId } = await params;
    idParamSchema.parse(userId);

    if (userId === user.id) {
      return jsonError("Không thể tự xoá quyền của chính mình", 400);
    }

    const db = createAdminClient();
    const { data: target, error: fetchErr } = await db
      .from("admin_roles")
      .select("user_id, email, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!target) return jsonError("Không tìm thấy thành viên này", 404);

    const { error } = await db.from("admin_roles").delete().eq("user_id", userId);
    if (error) throw error;

    void db
      .from("audit_logs")
      .insert({
        actor_email: user.email ?? "unknown",
        action: "revoke_role",
        target_type: "admin_roles",
        target_id: userId,
        metadata: { email: target.email, role: target.role },
      })
      .then(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
