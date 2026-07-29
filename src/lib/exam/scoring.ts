import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SnapshotQuestion } from "./generate-snapshot";

type AnswerRow = { question_id: string; selected_options: number[] };

export type ScoreDetailItem = {
  question_id: string;
  content: string;
  options: string[];
  correct_answers: number[];
  selected_options: number[];
  is_correct: boolean;
  points: number;
  earned_points: number;
};

function isCorrect(q: SnapshotQuestion, selected: number[] | undefined): boolean {
  const sel = new Set(selected ?? []);
  const correct = new Set(q.correct_answers);
  if (sel.size !== correct.size) return false;
  for (const s of sel) if (!correct.has(s)) return false;
  return true;
}

/**
 * Chấm điểm 1 lượt thi: all-or-nothing cho câu nhiều đáp án đúng (chọn thiếu/
 * thừa/sai đều 0 điểm cho câu đó).
 *
 * 2 chế độ chấm cấp đề thi (exams.scoring_mode):
 * - 'uniform'（mặc định): điểm = scale * (số câu đúng / tổng số câu) — mọi câu
 *   có trọng số như nhau, không quan tâm exam_sessions.snapshot_questions[].points.
 * - 'per_question': điểm = tổng "points" của các câu làm đúng (points được
 *   snapshot tại thời điểm sinh đề, không đổi dù sau này admin sửa điểm câu
 *   hỏi trong ngân hàng — nhất quán với nguyên tắc snapshot chung của hệ thống).
 *
 * Idempotent: gọi nhiều lần chỉ upsert lại đúng 1 bản ghi trong `scores`.
 */
export async function scoreSession(sessionId: string): Promise<void> {
  const db = createAdminClient();

  // session và answers không phụ thuộc lẫn nhau (cả 2 chỉ cần sessionId đã có
  // sẵn) — chạy song song thay vì tuần tự để giảm 1 round-trip.
  const [sessionRes, answersRes] = await Promise.all([
    db
      .from("exam_sessions")
      .select("snapshot_questions, exam_id, exams(scoring_mode, scale)")
      .eq("id", sessionId)
      .single(),
    db.from("answers").select("question_id, selected_options").eq("session_id", sessionId),
  ]);
  if (sessionRes.error) throw sessionRes.error;
  if (answersRes.error) throw answersRes.error;
  const session = sessionRes.data;
  const answerRows = answersRes.data;

  const snapshot = session.snapshot_questions as unknown as SnapshotQuestion[];
  const examConfig = session.exams as unknown as {
    scoring_mode: "uniform" | "per_question";
    scale: number;
  };

  const answerByQuestion = new Map(
    ((answerRows ?? []) as AnswerRow[]).map((a) => [a.question_id, a.selected_options])
  );

  const scoringMode = examConfig?.scoring_mode ?? "uniform";
  const scale = Number(examConfig?.scale ?? 10);

  const detail: ScoreDetailItem[] = snapshot.map((q) => {
    const selected = answerByQuestion.get(q.id) ?? [];
    const correct = isCorrect(q, selected);
    const questionPoints = Number(q.points ?? 1);
    return {
      question_id: q.id,
      content: q.content,
      options: q.options,
      correct_answers: q.correct_answers,
      selected_options: selected,
      is_correct: correct,
      points: questionPoints,
      earned_points: correct ? questionPoints : 0,
    };
  });

  let totalScore: number;
  if (scoringMode === "per_question") {
    totalScore = detail.reduce((sum, d) => sum + d.earned_points, 0);
  } else {
    const correctCount = detail.filter((d) => d.is_correct).length;
    totalScore = snapshot.length === 0 ? 0 : (scale * correctCount) / snapshot.length;
  }

  const { error: upsertErr } = await db
    .from("scores")
    .upsert(
      { session_id: sessionId, total_score: totalScore, detail },
      { onConflict: "session_id" }
    );
  if (upsertErr) throw upsertErr;
}
