import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";

const createSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "supervisor"]),
});

const SEVEN_DAYS_MS = 7 * 86_400_000;

/** Quản lý invitation cho giám sát viên/admin — chỉ admin được dùng. */
export async function GET() {
  try {
    await requireRole("admin");
    const db = createAdminClient();
    const [invites, roles] = await Promise.all([
      db
        .from("admin_invites")
        .select("id, token, email, role, created_by, expires_at, used_at, created_at")
        .order("created_at", { ascending: false }),
      db.from("admin_roles").select("user_id, email, role, created_at"),
    ]);
    if (invites.error) throw invites.error;
    if (roles.error) throw roles.error;
    return NextResponse.json({ invites: invites.data ?? [], roles: roles.data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireRole("admin");
    const body = createSchema.parse(await req.json());
    const db = createAdminClient();

    const token = randomBytes(24).toString("hex");
    const { data, error } = await db
      .from("admin_invites")
      .insert({
        token,
        email: body.email.toLowerCase(),
        role: body.role,
        created_by: user.email ?? "unknown",
        expires_at: new Date(Date.now() + SEVEN_DAYS_MS).toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    await db.from("audit_logs").insert({
      actor_email: user.email ?? "unknown",
      action: "create_invite",
      target_type: "admin_invites",
      target_id: data.id,
      metadata: { email: body.email, role: body.role },
    });

    return NextResponse.json({ invite: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
