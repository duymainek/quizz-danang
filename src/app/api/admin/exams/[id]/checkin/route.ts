import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { getConfig } from "@/lib/config";
import { getCurrentTermId } from "@/lib/terms";

/**
 * P6 — QR exit check-in (admin side).
 * GET: trả token hiện hành (tự tạo/rotate khi hết hạn) + danh sách check-in realtime.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission("manage_checkin");
    const { id: examId } = await params;
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);

    const [enabled, rotateSeconds] = await Promise.all([
      getConfig<boolean>(db, "exit_checkin_enabled", { termId, examId }),
      getConfig<number>(db, "checkin_token_rotate_seconds", { termId, examId }),
    ]);

    // Token hiện hành — rotate khi hết hạn.
    let token: string | null = null;
    let expiresAt: string | null = null;
    if (enabled) {
      const { data: current } = await db
        .from("checkin_tokens")
        .select("token, expires_at")
        .eq("exam_id", examId)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (current) {
        token = current.token;
        expiresAt = current.expires_at;
      } else {
        const newToken = randomBytes(16).toString("hex");
        const exp = new Date(Date.now() + rotateSeconds * 1000).toISOString();
        const { error: insErr } = await db
          .from("checkin_tokens")
          .insert({ exam_id: examId, token: newToken, expires_at: exp });
        if (insErr) throw insErr;
        token = newToken;
        expiresAt = exp;
        // Dọn token cũ (best-effort).
        void db
          .from("checkin_tokens")
          .delete()
          .eq("exam_id", examId)
          .lt("expires_at", new Date(Date.now() - 3_600_000).toISOString())
          .then(() => {});
      }
    }

    // Danh sách check-in + đếm đã nộp.
    const [checkinsRes, submittedRes] = await Promise.all([
      db
        .from("checkins")
        .select("id, created_at, device_matched, students(code, full_name)")
        .eq("exam_id", examId)
        .order("created_at", { ascending: false }),
      db
        .from("exam_sessions")
        .select("id", { count: "exact", head: true })
        .eq("exam_id", examId)
        .in("status", ["submitted", "auto_submitted"]),
    ]);
    if (checkinsRes.error) throw checkinsRes.error;
    if (submittedRes.error) throw submittedRes.error;

    type CheckinRow = {
      id: string;
      created_at: string;
      device_matched: boolean | null;
      students: { code: string; full_name: string | null } | null;
    };

    return NextResponse.json({
      enabled,
      rotate_seconds: rotateSeconds,
      token,
      expires_at: expiresAt,
      submitted_count: submittedRes.count ?? 0,
      checkins: ((checkinsRes.data ?? []) as unknown as CheckinRow[]).map((c) => ({
        id: c.id,
        created_at: c.created_at,
        device_matched: c.device_matched,
        code: c.students?.code ?? "",
        full_name: c.students?.full_name ?? null,
      })),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
