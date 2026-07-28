import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * P7 — Settings cascade: system → term → exam.
 * Tầng dưới override tầng trên; không set thì kế thừa. Value là jsonb tự do.
 */

export type ConfigScope = { termId?: string | null; examId?: string | null };

/** Danh mục key hợp lệ + giá trị mặc định hệ thống (fallback cuối cùng). */
export const CONFIG_DEFAULTS: Record<string, unknown> = {
  // Giám sát & chống gian lận
  exit_checkin_enabled: false,
  checkin_token_rotate_seconds: 45,
  silent_detection_enabled: true,
  // Kết quả & hiển thị
  leaderboard_public: false,
  // Phân quyền: danh sách permission của role supervisor (null = dùng mặc định)
  role_permissions: null,
  // Nội dung
  organizer_name: "Ban tổ chức",
};

export async function getConfig<T = unknown>(
  db: SupabaseClient,
  key: string,
  scope: ConfigScope = {}
): Promise<T> {
  const filters: { scope_type: string; scope_id: string | null }[] = [];
  if (scope.examId) filters.push({ scope_type: "exam", scope_id: scope.examId });
  if (scope.termId) filters.push({ scope_type: "term", scope_id: scope.termId });
  filters.push({ scope_type: "system", scope_id: null });

  const { data, error } = await db
    .from("app_config")
    .select("scope_type, scope_id, value")
    .eq("key", key);
  if (error) throw error;

  for (const f of filters) {
    const hit = (data ?? []).find(
      (r) => r.scope_type === f.scope_type && (r.scope_id ?? null) === f.scope_id
    );
    if (hit) return hit.value as T;
  }
  return CONFIG_DEFAULTS[key] as T;
}

/** Set (upsert) 1 setting tại 1 scope. value=null nghĩa là xóa override (trả về kế thừa). */
export async function setConfig(
  db: SupabaseClient,
  key: string,
  value: unknown,
  scope: ConfigScope = {}
): Promise<void> {
  const scope_type = scope.examId ? "exam" : scope.termId ? "term" : "system";
  const scope_id = scope.examId ?? scope.termId ?? null;

  if (value === null) {
    let del = db.from("app_config").delete().eq("key", key).eq("scope_type", scope_type);
    del = scope_id === null ? del.is("scope_id", null) : del.eq("scope_id", scope_id);
    const { error } = await del;
    if (error) throw error;
    return;
  }

  const { error } = await db
    .from("app_config")
    .upsert(
      { scope_type, scope_id, key, value, updated_at: new Date().toISOString() },
      { onConflict: "scope_type,scope_id,key" }
    );
  if (error) throw error;
}

/** Lấy nhiều key cùng lúc kèm nguồn giá trị (phục vụ UI hiển thị "kế thừa từ..."). */
export async function getConfigWithSource(
  db: SupabaseClient,
  keys: string[],
  scope: ConfigScope = {}
): Promise<Record<string, { value: unknown; source: "exam" | "term" | "system" | "default" }>> {
  const { data, error } = await db
    .from("app_config")
    .select("scope_type, scope_id, key, value")
    .in("key", keys);
  if (error) throw error;

  const out: Record<string, { value: unknown; source: "exam" | "term" | "system" | "default" }> =
    {};
  for (const key of keys) {
    const rows = (data ?? []).filter((r) => r.key === key);
    const examHit = scope.examId
      ? rows.find((r) => r.scope_type === "exam" && r.scope_id === scope.examId)
      : undefined;
    const termHit = scope.termId
      ? rows.find((r) => r.scope_type === "term" && r.scope_id === scope.termId)
      : undefined;
    const sysHit = rows.find((r) => r.scope_type === "system");
    if (examHit) out[key] = { value: examHit.value, source: "exam" };
    else if (termHit) out[key] = { value: termHit.value, source: "term" };
    else if (sysHit) out[key] = { value: sysHit.value, source: "system" };
    else out[key] = { value: CONFIG_DEFAULTS[key], source: "default" };
  }
  return out;
}
