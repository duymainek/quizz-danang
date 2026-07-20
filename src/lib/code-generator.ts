import { randomInt } from "crypto";

// Bỏ ký tự dễ nhầm: 0/O, 1/I/L, giữ bảng chữ đủ entropy cho quy mô hàng trăm mã.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Sinh 1 mã ngẫu nhiên bằng CSPRNG (crypto.randomInt), KHÔNG dùng Math.random. */
export function generateStudentCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return code;
}
