import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { getCurrentTermId } from "@/lib/terms";

const FLAG_WEIGHT: Record<string, number> = {
  multi_device: 3,
  parallel_session: 4,
  device_mismatch: 3,
  no_checkin: 2,
  checkin_invalid: 1,
};

/** P6 — Danh sách đối tượng nghi vấn trong khóa, sort theo risk score. */
export async function GET() {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);

    const { data, error } = await db
      .from("students")
      .select("id, code, full_name, unit, suspicion_flags")
      .eq("term_id", termId)
      .neq("suspicion_flags", "[]");
    if (error) throw error;

    const rows = (data ?? [])
      .map((s) => {
        const flags = (Array.isArray(s.suspicion_flags) ? s.suspicion_flags : []) as {
          flag: string;
          at: string;
          detail?: unknown;
        }[];
        const risk = flags.reduce((sum, f) => sum + (FLAG_WEIGHT[f.flag] ?? 1), 0);
        return {
          id: s.id,
          code: s.code,
          full_name: s.full_name,
          unit: s.unit,
          flags,
          risk_score: risk,
        };
      })
      .filter((r) => r.flags.length > 0)
      .sort((a, b) => b.risk_score - a.risk_score);

    return NextResponse.json({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}
