import "server-only";
import { randomBytes, createHash } from "crypto";

export const EXAM_COOKIE_NAME = "exam_session";

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildCookieValue(sessionId: string, token: string): string {
  return `${sessionId}.${token}`;
}

export function parseCookieValue(
  value: string | undefined
): { sessionId: string; token: string } | null {
  if (!value) return null;
  const idx = value.indexOf(".");
  if (idx < 0) return null;
  const sessionId = value.slice(0, idx);
  const token = value.slice(idx + 1);
  if (!sessionId || !token) return null;
  return { sessionId, token };
}

export const STUDENT_COOKIE_NAME = "student_session";
