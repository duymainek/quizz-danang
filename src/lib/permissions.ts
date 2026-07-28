import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config";

/**
 * Permission matrix động (không hardcode): quyền của role `supervisor` được
 * lưu trong app_config key `role_permissions` (scope system), admin chỉnh được
 * qua UI Phân quyền. Role `admin` luôn có toàn quyền.
 */

export const PERMISSIONS = [
  { key: "view_dashboard", label: "Xem dashboard & giám sát" },
  { key: "manage_questions", label: "Quản lý ngân hàng câu hỏi" },
  { key: "manage_exams", label: "Tạo/sửa/xóa đề thi" },
  { key: "manage_students", label: "Quản lý thí sinh (tạo/sửa/gán đề)" },
  { key: "ops_day", label: "Vận hành ngày thi (reset, gia hạn, nộp hộ, bỏ qua vi phạm)" },
  { key: "manage_results", label: "Xử lý kết quả (hủy KQ, sửa điểm, chấm lại)" },
  { key: "view_results", label: "Xem kết quả & leaderboard" },
  { key: "manage_checkin", label: "Vận hành check-in QR" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

/** Quyền mặc định của giám sát viên nếu admin chưa cấu hình. */
export const DEFAULT_SUPERVISOR_PERMISSIONS: PermissionKey[] = [
  "view_dashboard",
  "ops_day",
  "view_results",
  "manage_checkin",
];

export async function getSupervisorPermissions(
  db: SupabaseClient
): Promise<PermissionKey[]> {
  const value = await getConfig<PermissionKey[] | null>(db, "role_permissions", {});
  return Array.isArray(value) ? value : DEFAULT_SUPERVISOR_PERMISSIONS;
}

export async function hasPermission(
  db: SupabaseClient,
  role: "admin" | "supervisor",
  permission: PermissionKey
): Promise<boolean> {
  if (role === "admin") return true;
  const perms = await getSupervisorPermissions(db);
  return perms.includes(permission);
}
