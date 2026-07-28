import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { getSupervisorPermissions, PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    const { user, role } = await requireRole("supervisor");
    const permissions =
      role === "admin"
        ? PERMISSIONS.map((p) => p.key)
        : await getSupervisorPermissions(createAdminClient());
    return NextResponse.json({ email: user.email, role, permissions });
  } catch (err) {
    return handleApiError(err);
  }
}
