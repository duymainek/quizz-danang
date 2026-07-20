import { z } from "zod";

export const batchGenerateSchema = z.object({
  count: z
    .number()
    .int()
    .positive("Số lượng mã phải lớn hơn 0")
    .max(2000, "Mỗi lần sinh tối đa 2000 mã"),
  names: z.array(z.string().trim()).optional(),
});

export const updateStudentCodeSchema = z.object({
  student_name: z.string().trim().max(200).nullable(),
});
