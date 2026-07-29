import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { scoreSession } from "@/lib/exam/scoring";
import type { SnapshotQuestion } from "@/lib/exam/generate-snapshot";

/**
 * Chấm lại toàn bộ bài của 1 đề (chỉ admin).
 *
 * Chính sách đã chốt: snapshot lưu đáp án đúng tại thời điểm sinh đề — khi phát
 * hiện câu sai đáp án, admin sửa câu hỏi trong ngân hàng rồi bấm chấm lại:
 * 1. Với mỗi session: refresh `correct_answers` trong snapshot từ ngân hàng câu
 *    hỏi HIỆN TẠI (khớp theo question_id; câu đã bị xóa khỏi ngân hàng giữ nguyên
 *    đáp án snapshot cũ).
 * 2. Chạy lại scoreSession (idempotent, upsert scores).
 * Điểm sửa tay (manual_score) KHÔNG bị ghi đè — vẫn ưu tiên hiển thị.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requirePermission("manage_results");
    const { id: examId } = await params;
    const db = createAdminClient();

    // Đáp án đúng hiện tại của toàn bộ câu hỏi liên quan đề này.
    const { data: sessions, error } = await db
      .from("exam_sessions")
      .select("id, snapshot_questions, status")
      .eq("exam_id", examId)
      .in("status", ["submitted", "auto_submitted"]);
    if (error) throw error;

    const allQuestionIds = new Set<string>();
    for (const s of sessions ?? []) {
      for (const q of (s.snapshot_questions as unknown as SnapshotQuestion[]) ?? []) {
        allQuestionIds.add(q.id);
      }
    }
    const { data: currentQuestions, error: qErr } = await db
      .from("questions")
      .select("id, correct_answers")
      .in("id", Array.from(allQuestionIds));
    if (qErr) throw qErr;
    const currentById = new Map(
      (currentQuestions ?? []).map((q) => [q.id, q.correct_answers as number[]])
    );

    // Mỗi session độc lập hoàn toàn với các session khác — chấm lại song song
    // thay vì tuần tự từng session một (trước đây là O(N) round-trip nối tiếp
    // cho N thí sinh, rất chậm với đề đông thí sinh).
    await Promise.all(
      (sessions ?? []).map(async (s) => {
        const snapshot = (s.snapshot_questions as unknown as SnapshotQuestion[]) ?? [];
        let changed = false;
        const refreshed = snapshot.map((q) => {
          const current = currentById.get(q.id);
          if (
            current &&
            JSON.stringify([...current].sort()) !==
              JSON.stringify([...q.correct_answers].sort())
          ) {
            changed = true;
            return { ...q, correct_answers: current };
          }
          return q;
        });
        if (changed) {
          const { error: upErr } = await db
            .from("exam_sessions")
            .update({ snapshot_questions: refreshed })
            .eq("id", s.id);
          if (upErr) throw upErr;
        }
        await scoreSession(s.id);
      })
    );
    const updated = (sessions ?? []).length;

    // Audit log không chặn response.
    void db
      .from("audit_logs")
      .insert({
        actor_email: user.email ?? "unknown",
        action: "rescore_exam",
        target_type: "exams",
        target_id: examId,
        metadata: { sessions_rescored: updated },
      })
      .then(() => {});

    return NextResponse.json({ ok: true, sessions_rescored: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
