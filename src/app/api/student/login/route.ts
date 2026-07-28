import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { studentLoginSchema } from "@/lib/validation/student";
import { DEVICE_COOKIE_NAME, flagStudent } from "@/lib/exam/suspicion";
import {
  STUDENT_COOKIE_NAME,
  buildCookieValue,
  generateOpaqueToken,
  hashToken,
} from "@/lib/exam/session-token";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_YEAR = 60 * 60 * 24 * 365;

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const { code } = studentLoginSchema.parse(raw);
    // Fingerprint là optional, do client gửi kèm — không validate chặt vì
    // đây là tín hiệu silent, thiếu cũng không chặn đăng nhập.
    const fingerprint =
      raw && typeof raw.fingerprint === "object" && raw.fingerprint !== null
        ? (raw.fingerprint as Record<string, unknown>)
        : null;
    const db = createAdminClient();

    // Device id: cookie bền theo trình duyệt — tín hiệu chính cho multi_device.
    const cookieStore = await cookies();
    let deviceId = cookieStore.get(DEVICE_COOKIE_NAME)?.value ?? null;
    const isNewDevice = !deviceId;
    if (!deviceId) deviceId = randomUUID();

    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");
    const normalizedCode = code.trim().toUpperCase();

    const { data: student, error } = await db
      .from("students")
      .select("id, code, full_name")
      .eq("code", normalizedCode)
      .maybeSingle();
    if (error) throw error;

    // P6 — log MỌI lần đăng nhập, kể cả sai mã (dò mã là tín hiệu nghi vấn).
    void db
      .from("login_events")
      .insert({
        student_id: student?.id ?? null,
        code_input: normalizedCode,
        success: !!student,
        ip_address: ip,
        user_agent: userAgent,
        device_id: deviceId,
        fingerprint,
      })
      .then(() => {});

    if (!student) return jsonError("Không tìm thấy mã số này, vui lòng kiểm tra lại", 404);

    // Silent detection: SBD này từng đăng nhập thành công trên thiết bị khác?
    const { data: priorDevices } = await db
      .from("login_events")
      .select("device_id")
      .eq("student_id", student.id)
      .eq("success", true)
      .not("device_id", "is", null)
      .limit(200);
    const distinct = new Set((priorDevices ?? []).map((d) => d.device_id));
    distinct.add(deviceId);
    if (distinct.size >= 2) {
      void flagStudent(db, student.id, "multi_device", {
        device_count: distinct.size,
        is_new_device: isNewDevice,
        ip,
      });
    }

    const token = generateOpaqueToken();
    const { error: updateErr } = await db
      .from("students")
      .update({ portal_token_hash: hashToken(token) })
      .eq("id", student.id);
    if (updateErr) throw updateErr;

    cookieStore.set(STUDENT_COOKIE_NAME, buildCookieValue(student.id, token), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    cookieStore.set(DEVICE_COOKIE_NAME, deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ONE_YEAR,
    });

    return NextResponse.json({
      student: { code: student.code, full_name: student.full_name },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
