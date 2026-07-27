import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { STUDENT_COOKIE_NAME } from "@/lib/exam/session-token";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(STUDENT_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
