import { z } from "zod";

export const createStudentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional(),
  full_name: z.string().trim().max(200).optional().nullable(),
  birth_year: z.number().int().min(1900).max(2100).optional().nullable(),
  unit: z.string().trim().max(200).optional().nullable(),
});

export const updateStudentSchema = z.object({
  code: z.string().trim().min(1).max(50).optional(),
  full_name: z.string().trim().max(200).nullable().optional(),
  birth_year: z.number().int().min(1900).max(2100).nullable().optional(),
  unit: z.string().trim().max(200).nullable().optional(),
});

export const assignStudentsSchema = z.object({
  student_ids: z.array(z.string().uuid()).min(1, "Chọn ít nhất 1 thí sinh"),
});
