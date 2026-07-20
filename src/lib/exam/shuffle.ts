import { randomInt } from "crypto";

/** Fisher-Yates shuffle dùng crypto.randomInt (CSPRNG), không dùng Math.random. */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Rút ngẫu nhiên đúng `count` phần tử từ mảng (không lặp lại). */
export function drawRandom<T>(input: T[], count: number): T[] {
  return shuffle(input).slice(0, count);
}
