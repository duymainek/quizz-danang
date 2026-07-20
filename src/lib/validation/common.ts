import { z } from "zod";

export const nameInputSchema = z.object({
  name: z.string().trim().min(1, "Tên không được để trống").max(200),
});

export const idParamSchema = z.string().uuid("ID không hợp lệ");
