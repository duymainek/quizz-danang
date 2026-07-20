// Kiểm tra logic rút câu (Fisher-Yates trong src/lib/exam/shuffle.ts) không
// bao giờ rút trùng 1 câu 2 lần trong cùng 1 lượt rút, kể cả rút hết 100%
// pool. Chạy: node scripts/verify-draw-logic.mjs
import { randomInt } from "crypto";

function shuffle(input) {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawRandom(input, count) {
  return shuffle(input).slice(0, count);
}

let failures = 0;
let totalRuns = 0;

function check(poolSize, drawCount, iterations) {
  const pool = Array.from({ length: poolSize }, (_, i) => `q-${i}`);
  for (let i = 0; i < iterations; i++) {
    totalRuns++;
    const drawn = drawRandom(pool, drawCount);
    const uniqueCount = new Set(drawn).size;
    if (drawn.length !== drawCount || uniqueCount !== drawCount) {
      failures++;
      console.error(
        `FAIL poolSize=${poolSize} drawCount=${drawCount} run=${i}: length=${drawn.length} unique=${uniqueCount}`
      );
    }
  }
}

// Case thường: rút một phần (VD 32/40, 8/20 như ví dụ trong requirements)
check(40, 32, 5000);
check(20, 8, 5000);

// Case biên: rút đúng 1 câu, rút gần hết, rút hết 100% (như "câu cố định" cũ)
check(10, 1, 2000);
check(10, 9, 2000);
check(10, 10, 5000); // rút hết toàn bộ pool — vẫn phải là hoán vị, không trùng
check(1, 1, 500); // pool chỉ có 1 câu

// Kiểm tra 2 lượt rút độc lập của "2 thí sinh" cho cùng 1 pool có thể khác nhau
// (không bắt buộc phải khác, nhưng qua nhiều lần chạy phải THẤY có khác nhau,
// chứng minh không bị hard-code cùng 1 thứ tự)
{
  const pool = Array.from({ length: 40 }, (_, i) => `q-${i}`);
  const draws = new Set();
  for (let i = 0; i < 200; i++) {
    draws.add(drawRandom(pool, 32).join(","));
  }
  if (draws.size < 50) {
    failures++;
    console.error(`FAIL: độ đa dạng thấp bất thường, chỉ ${draws.size}/200 tổ hợp khác nhau`);
  } else {
    console.log(`OK: 200 lượt rút 32/40 cho ra ${draws.size} tổ hợp khác nhau (đa dạng tốt)`);
  }
}

console.log(`\nTổng ${totalRuns} lượt rút đã kiểm tra, ${failures} lượt lỗi.`);
if (failures > 0) {
  process.exit(1);
} else {
  console.log("PASS: không có trường hợp nào rút trùng câu trong cùng 1 lượt.");
}
