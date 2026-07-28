import { createServerSupabase } from "@/lib/supabase/server";

/**
 * Trả về user admin hiện tại (đã qua middleware chặn nếu chưa login).
 * Vẫn tự check lại ở đây cho các nơi gọi trực tiếp ngoài luồng middleware
 * (defense in depth) và để lấy user.id phục vụ audit log (VD US-07 reset).
 */
export async function requireAdminUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthError("Chưa đăng nhập hoặc phiên đã hết hạn");
  }
  return user;
}

export class AuthError extends Error {}

export class ForbiddenError extends Error {}

export type AdminRole = "admin" | "supervisor";

/**
 * Phân quyền: user KHÔNG có row trong admin_roles = 'admin' (bootstrap an toàn
 * cho các tài khoản có sẵn); supervisor được tạo tường minh qua invitation.
 */
export async function getAdminRole(userId: string): Promise<AdminRole> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const db = createAdminClient();
  const { data } = await db
    .from("admin_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.role as AdminRole) ?? "admin";
}

/** Yêu cầu đăng nhập + đúng quyền. minRole="admin" chặn supervisor. */
export async function requireRole(minRole: AdminRole = "supervisor") {
  const user = await requireAdminUser();
  const role = await getAdminRole(user.id);
  if (minRole === "admin" && role !== "admin") {
    throw new ForbiddenError("Tài khoản giám sát viên không có quyền thực hiện thao tác này");
  }
  return { user, role };
}

/**
 * Yêu cầu 1 permission cụ thể theo matrix động (app_config `role_permissions`).
 * Admin luôn pass; supervisor phụ thuộc cấu hình admin đặt trong Phân quyền.
 */
export async function requirePermission(permission: import("@/lib/permissions").PermissionKey) {
  const user = await requireAdminUser();
  const role = await getAdminRole(user.id);
  if (role !== "admin") {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { hasPermission } = await import("@/lib/permissions");
    const ok = await hasPermission(createAdminClient(), role, permission);
    if (!ok) {
      throw new ForbiddenError("Tài khoản của bạn chưa được cấp quyền thực hiện thao tác này");
    }
  }
  return { user, role };
}
