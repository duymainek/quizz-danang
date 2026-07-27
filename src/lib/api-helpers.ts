import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";
import { ExamSessionError } from "@/lib/exam/session-guard";
import { StudentSessionError } from "@/lib/student/session";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Bọc handler API admin: xử lý lỗi thống nhất, trả JSON tiếng Việt dễ hiểu. */
export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return jsonError(err.message, 401);
  }
  if (err instanceof StudentSessionError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof ZodError) {
    return jsonError(err.issues.map((i) => i.message).join("; "), 422);
  }
  if (err instanceof Error) {
    console.error(err);
    return jsonError(err.message, 400);
  }
  console.error(err);
  return jsonError("Có lỗi không xác định xảy ra", 500);
}

/** Bọc handler API /exam/*: thêm xử lý ExamSessionError so với handleApiError. */
export function handleExamApiError(err: unknown) {
  if (err instanceof ExamSessionError) {
    return jsonError(err.message, err.status);
  }
  return handleApiError(err);
}
