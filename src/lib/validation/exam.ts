import { z } from "zod";

export const poolConfigInputSchema = z.object({
  pool_id: z.string().uuid("pool_id không hợp lệ"),
  num_questions_to_draw: z
    .number()
    .int()
    .positive("Số câu rút phải lớn hơn 0"),
});

export const scoringModeSchema = z.enum(["uniform", "per_question"]);

export const examInputSchema = z.object({
  subject_id: z.string().uuid("subject_id không hợp lệ"),
  name: z.string().trim().min(1, "Tên đề thi không được để trống").max(200),
  duration_minutes: z.number().int().positive("Thời lượng phải lớn hơn 0 phút"),
  max_violations: z.number().int().min(0, "Số lần vi phạm cho phép phải >= 0"),
  monitoring_enabled: z.boolean(),
  scoring_mode: scoringModeSchema.default("uniform"),
  scale: z.number().positive("Thang điểm phải lớn hơn 0").default(10),
  pool_configs: z
    .array(poolConfigInputSchema)
    .min(1, "Đề thi phải có ít nhất 1 tệp câu hỏi được cấu hình")
    .superRefine((configs, ctx) => {
      const seen = new Set<string>();
      for (const c of configs) {
        if (seen.has(c.pool_id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Một tệp câu hỏi không được cấu hình 2 lần trong cùng 1 đề",
          });
        }
        seen.add(c.pool_id);
      }
    }),
});

export type ExamInput = z.infer<typeof examInputSchema>;
