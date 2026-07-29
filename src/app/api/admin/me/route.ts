import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-helpers";
import { DEFAULT_SUPERVISOR_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  try {
    // requireRole đã gộp sẵn role + permissions trong 1 round-trip RPC —
    // không cần query role_permissions thêm 1 lần nữa ở đây.
    const { user, role, permissions } = await requireRole("supervisor");
    const resolvedPermissions =
      role === "admin"
        ? PERMISSIONS.map((p) => p.key)
        : (permissions ?? DEFAULT_SUPERVISOR_PERMISSIONS);
    return NextResponse.json({ email: user.email, role, permissions: resolvedPermissions });
  } catch (err) {
    return handleApiError(err);
  }
}
