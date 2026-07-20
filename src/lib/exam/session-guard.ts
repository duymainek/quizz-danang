import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXAM_COOKIE_NAME, hashToken, parseCookieValue } from "./session-token";
import { scoreSession } from "./scoring";

export class ExamSessionError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

type ExamSessionRow = {
  id: string;
  student_code_id: string;
  exam_id: string;
  snapshot_questions: unknown;
  session_token_hash: string;
  started_at: string;
  submitted_at: string | null;
  status: "in_progress" | "submitted" | "auto_submitted" | "reset";
  violation_count: number;
  exams: {
    duration_minutes: number;
    max_violations: number;
    monitoring_enabled: boolean;
    name: string;
  };
  student_codes: {
    code: string;
    student_name: string | null;
  };
};

/**
 * Đọc cookie phiên thi, xác thực token, và tự động chuyển session sang
 * auto_submitted nếu đã quá thời gian làm bài (lazy check — nguồn thời gian
 * luôn là server, không tin client). Mọi API /exam/* dùng chung hàm này.
 */
export async function resolveExamSession(): Promise<{
  session: ExamSessionRow;
  db: ReturnType<typeof createAdminClient>;
}> {
  const cookieStore = await cookies();
  const parsed = parseCookieValue(cookieStore.get(EXAM_COOKIE_NAME)?.value);
  if (!parsed) throw new ExamSessionError("Chưa có phiên thi, vui lòng đăng nhập lại");

  const db = createAdminClient();
  const { data: session, error } = await db
    .from("exam_sessions")
    .select(
      "id, student_code_id, exam_id, snapshot_questions, session_token_hash, started_at, submitted_at, status, violation_count, exams(duration_minutes, max_violations, monitoring_enabled, name), student_codes(code, student_name)"
    )
    .eq("id", parsed.sessionId)
    .single();

  if (error || !session) throw new ExamSessionError("Phiên thi không tồn tại");

  const expectedHash = hashToken(parsed.token);
  if (expectedHash !== session.session_token_hash) {
    throw new ExamSessionError("Phiên thi không hợp lệ");
  }

  const examSessionRow = session as unknown as ExamSessionRow;

  if (examSessionRow.status === "in_progress") {
    const startedAt = new Date(examSessionRow.started_at).getTime();
    const deadline = startedAt + examSessionRow.exams.duration_minutes * 60_000;
    if (Date.now() > deadline) {
      await scoreSession(examSessionRow.id);
      const { data: updated, error: updateErr } = await db
        .from("exam_sessions")
        .update({ status: "auto_submitted", submitted_at: new Date().toISOString() })
        .eq("id", examSessionRow.id)
        .eq("status", "in_progress") // tránh ghi đè nếu đã có request khác submit trước
        .select(
          "id, student_code_id, exam_id, snapshot_questions, session_token_hash, started_at, submitted_at, status, violation_count, exams(duration_minutes, max_violations, monitoring_enabled, name), student_codes(code, student_name)"
        )
        .single();
      if (!updateErr && updated) {
        return { session: updated as unknown as ExamSessionRow, db };
      }
      // Nếu update không trúng row (đã có request khác submit trước) — đọc lại state mới nhất.
      const { data: latest } = await db
        .from("exam_sessions")
        .select(
          "id, student_code_id, exam_id, snapshot_questions, session_token_hash, started_at, submitted_at, status, violation_count, exams(duration_minutes, max_violations, monitoring_enabled, name), student_codes(code, student_name)"
        )
        .eq("id", examSessionRow.id)
        .single();
      if (latest) return { session: latest as unknown as ExamSessionRow, db };
    }
  }

  return { session: examSessionRow, db };
}
