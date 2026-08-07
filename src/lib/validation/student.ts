import { z } from "zod";

export const studentLoginSchema = z.object({
  code: z.string().trim().min(1, "Vui lòng nhập mã số"),
  // false/omit = chỉ tra cứu thông tin để thí sinh xác nhận, chưa tính phiên.
  // true = thí sinh đã xác nhận đúng là mình, tạo phiên đăng nhập thật sự.
  confirm: z.boolean().optional(),
});
