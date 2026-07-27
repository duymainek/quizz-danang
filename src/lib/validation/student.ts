import { z } from "zod";

export const studentLoginSchema = z.object({
  code: z.string().trim().min(1, "Vui lòng nhập mã số"),
});
