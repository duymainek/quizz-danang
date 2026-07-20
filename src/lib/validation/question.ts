import { z } from "zod";

export const questionTypeSchema = z.enum(["single", "multi"]);

export const questionInputSchema = z
  .object({
    content: z.string().trim().min(1, "Nội dung câu hỏi không được để trống"),
    type: questionTypeSchema,
    options: z
      .array(z.string().trim().min(1, "Lựa chọn không được để trống"))
      .min(2, "Câu hỏi cần ít nhất 2 lựa chọn"),
    correct_answers: z
      .array(z.number().int().min(0))
      .min(1, "Phải chọn ít nhất 1 đáp án đúng"),
    points: z.number().positive("Điểm câu hỏi phải lớn hơn 0").default(1),
  })
  .superRefine((data, ctx) => {
    const maxIndex = data.options.length - 1;
    for (const idx of data.correct_answers) {
      if (idx > maxIndex) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Đáp án đúng tham chiếu tới lựa chọn không tồn tại (index ${idx})`,
        });
      }
    }
    const uniqueCorrect = new Set(data.correct_answers);
    if (uniqueCorrect.size !== data.correct_answers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Đáp án đúng bị trùng lặp",
      });
    }
    if (data.type === "single" && data.correct_answers.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Câu hỏi 1 đáp án đúng phải có đúng 1 phần tử trong đáp án đúng",
      });
    }
    if (data.type === "multi" && data.correct_answers.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Câu hỏi nhiều đáp án đúng phải có từ 2 đáp án đúng trở lên",
      });
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;
