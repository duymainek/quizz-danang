import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";

const schema = z.object({
  token: z.string().min(16),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(72),
});

/** Người được mời mở link, đặt mật khẩu → tạo tài khoản Supabase + gán role. */
export async function POST(req: NextRequest) {
  try {
    const { token, password } = schema.parse(await req.json());
    const db = createAdminClient();

    const { data: invite, error } = await db
      .from("admin_invites")
      .select("id, email, role, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!invite) return jsonError("Link mời không hợp lệ", 404);
    if (invite.used_at) return jsonError("Link mời này đã được sử dụng", 410);
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      return jsonError("Link mời đã hết hạn, vui lòng yêu cầu admin gửi lại", 410);
    }

    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      if (createErr.message.toLowerCase().includes("already")) {
        return jsonError("Email này đã có tài khoản — hãy đăng nhập trực tiếp", 409);
      }
      throw createErr;
    }

    const { error: roleErr } = await db.from("admin_roles").insert({
      user_id: created.user.id,
      email: invite.email,
      role: invite.role,
    });
    if (roleErr) throw roleErr;

    await db
      .from("admin_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id);

    await db.from("audit_logs").insert({
      actor_email: invite.email,
      action: "accept_invite",
      target_type: "admin_roles",
      target_id: created.user.id,
      metadata: { role: invite.role },
    });

    return NextResponse.json({ ok: true, email: invite.email });
  } catch (err) {
    return handleApiError(err);
  }
}
