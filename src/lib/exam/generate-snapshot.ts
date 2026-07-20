import "server-only";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { drawRandom, shuffle } from "./shuffle";

type DbQuestion = {
  id: string;
  content: string;
  type: "single" | "multi";
  options: string[];
  correct_answers: number[];
  points: number;
};

export type SnapshotQuestion = {
  id: string; // UUID riêng cho lượt thi này, KHÔNG phải id gốc trong ngân hàng câu hỏi
  content: string;
  type: "single" | "multi";
  options: string[];
  correct_answers: number[];
  points: number; // điểm câu hỏi tại thời điểm sinh đề, dùng khi exam.scoring_mode = 'per_question'
};

export type PublicSnapshotQuestion = Omit<SnapshotQuestion, "correct_answers">;

/**
 * Sinh đề (snapshot) cho 1 lượt thi: với mỗi tệp trong cấu hình đề thi, rút
 * ngẫu nhiên đúng số câu đã cấu hình (độc lập hoàn toàn cho từng thí sinh),
 * shuffle thứ tự đáp án trong từng câu, rồi shuffle thứ tự tổng thể các câu.
 */
export async function generateExamSnapshot(
  examId: string
): Promise<SnapshotQuestion[]> {
  const db = createAdminClient();

  const { data: configs, error: configErr } = await db
    .from("exam_pool_configs")
    .select("pool_id, num_questions_to_draw, question_pools(name)")
    .eq("exam_id", examId);
  if (configErr) throw configErr;
  if (!configs || configs.length === 0) {
    throw new Error("Đề thi chưa được cấu hình tệp câu hỏi nào");
  }

  const drawnFromAllPools: SnapshotQuestion[] = [];

  for (const cfg of configs) {
    const { data: questions, error: qErr } = await db
      .from("questions")
      .select("id, content, type, options, correct_answers, points")
      .eq("pool_id", cfg.pool_id);
    if (qErr) throw qErr;

    const available = (questions ?? []) as DbQuestion[];
    if (available.length < cfg.num_questions_to_draw) {
      const poolName =
        (cfg.question_pools as unknown as { name: string } | null)?.name ?? cfg.pool_id;
      throw new Error(
        `Tệp "${poolName}" chỉ còn ${available.length} câu, không đủ để rút ${cfg.num_questions_to_draw} câu như cấu hình đề thi. Vui lòng liên hệ admin.`
      );
    }

    const drawn = drawRandom(available, cfg.num_questions_to_draw);

    for (const q of drawn) {
      // Shuffle thứ tự lựa chọn, remap lại index đáp án đúng theo thứ tự mới.
      const optionIndices = q.options.map((_, idx) => idx);
      const shuffledIndices = shuffle(optionIndices);
      const newOptions = shuffledIndices.map((oldIdx) => q.options[oldIdx]);
      const newCorrectAnswers = q.correct_answers
        .map((oldIdx) => shuffledIndices.indexOf(oldIdx))
        .sort((a, b) => a - b);

      drawnFromAllPools.push({
        id: randomUUID(),
        content: q.content,
        type: q.type,
        options: newOptions,
        correct_answers: newCorrectAnswers,
        points: Number(q.points),
      });
    }
  }

  return shuffle(drawnFromAllPools);
}

export function toPublicQuestions(
  snapshot: SnapshotQuestion[]
): PublicSnapshotQuestion[] {
  // points không nhạy cảm (không lộ đáp án đúng) nên vẫn trả về — có thể dùng
  // để hiển thị trọng số câu hỏi cho thí sinh sau này nếu cần, hiện UI chưa dùng tới.
  return snapshot.map(({ id, content, type, options, points }) => ({
    id,
    content,
    type,
    options,
    points,
  }));
}
