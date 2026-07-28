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
  exam_assignment_id: string;
  exam_id: string;
  snapshot_questions: unknown;
  session_token_hash: string;
  started_at: string;
  submitted_at: string | null;
  status: "in_progress" | "submitted" | "auto_submitted" | "reset";
  violation_count: number;
  extra_minutes: number;
  exams: {
    duration_minutes: number;
    max_violations: number;
    monitoring_enabled: boolean;
    name: string;
  };
};

const SELECT_FIELDS =
  "id, exam_assignment_id, exam_id, snapshot_questions, session_token_hash, started_at, submitted_at, status, violation_count, extra_minutes, exams(duration_minutes, max_violations, monitoring_enabled, name)";

/** Lấy tên/mã thí sinh qua exam_assignment — tách truy vấn riêng thay vì embed
 * 2 tầng (exam_sessions -> exam_assignments -> students) để nhất quán với
 * cách đã xử lý các lỗi PostgREST embed sâu trước đây trong dự án. */
async function fetchStudentInfo(db: ReturnType<typeof createAdminClient>, examAssignmentId: string) {
  const { data } = await db
    .from("exam_assignments")
    .select("students(code, full_name)")
    .eq("id", examAssignmentId)
    .single();
  const student = (data?.students ?? null) as unknown as {
    code: string;
    full_name: string | null;
  } | null;
  return { code: student?.code ?? "", student_name: student?.full_name ?? null };
}

/**
 * Đọc cookie phiên thi, xác thực token, và tự động chuyển session sang
 * auto_submitted nếu đã quá thời gian làm bài (lazy check — nguồn thời gian
 * luôn là server, không tin client). Mọi API /exam/* dùng chung hàm này.
 */
export async function resolveExamSession(): Promise<{
  session: ExamSessionRow & { student: { code: string; student_name: string | null } };
  db: ReturnType<typeof createAdminClient>;
}> {
  const cookieStore = await cookies();
  const parsed = parseCookieValue(cookieStore.get(EXAM_COOKIE_NAME)?.value);
  if (!parsed) throw new ExamSessionError("Chưa có phiên thi, vui lòng đăng nhập lại");

  const db = createAdminClient();
  const { data: session, error } = await db
    .from("exam_sessions")
    .select(SELECT_FIELDS)
    .eq("id", parsed.sessionId)
    .single();

  if (error || !session) throw new ExamSessionError("Phiên thi không tồn tại");

  const expectedHash = hashToken(parsed.token);
  if (expectedHash !== session.session_token_hash) {
    throw new ExamSessionError("Phiên thi không hợp lệ");
  }

  let examSessionRow = session as unknown as ExamSessionRow;

  if (examSessionRow.status === "in_progress") {
    const startedAt = new Date(examSessionRow.started_at).getTime();
    const deadline =
      startedAt +
      (examSessionRow.exams.duration_minutes + (examSessionRow.extra_minutes ?? 0)) * 60_000;
    if (Date.now() > deadline) {
      await scoreSession(examSessionRow.id);
      const { data: updated, error: updateErr } = await db
        .from("exam_sessions")
        .update({ status: "auto_submitted", submitted_at: new Date().toISOString() })
        .eq("id", examSessionRow.id)
        .eq("status", "in_progress") // tránh ghi đè nếu đã có request khác submit trước
        .select(SELECT_FIELDS)
        .single();
      if (!updateErr && updated) {
        examSessionRow = updated as unknown as ExamSessionRow;
      } else {
        // Nếu update không trúng row (đã có request khác submit trước) — đọc lại state mới nhất.
        const { data: latest } = await db
          .from("exam_sessions")
          .select(SELECT_FIELDS)
          .eq("id", examSessionRow.id)
          .single();
        if (latest) examSessionRow = latest as unknown as ExamSessionRow;
      }
      await db
        .from("exam_assignments")
        .update({ status: "submitted" })
        .eq("id", examSessionRow.exam_assignment_id)
        .neq("status", "submitted");
    }
  }

  const student = await fetchStudentInfo(db, examSessionRow.exam_assignment_id);
  return { session: { ...examSessionRow, student }, db };
}
