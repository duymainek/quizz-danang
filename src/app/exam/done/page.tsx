"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const REASON_MESSAGE: Record<string, string> = {
  manual: "Bạn đã nộp bài thành công.",
  timeout: "Đã hết thời gian làm bài — hệ thống đã tự động nộp bài cho bạn.",
  auto_submitted:
    "Bài thi đã bị tự động nộp do vi phạm vượt quá số lần cho phép.",
  submitted: "Mã số này đã nộp bài trước đó.",
  already: "Mã số này đã được sử dụng để nộp bài.",
};

function DoneContent() {
  const params = useSearchParams();
  const reason = params.get("reason") ?? "manual";
  const message = REASON_MESSAGE[reason] ?? REASON_MESSAGE.manual;
  const isViolation = reason === "auto_submitted";
  const [student, setStudent] = useState<{ code: string; student_name: string | null } | null>(
    null
  );
  // Số câu đã có đáp án trên tổng số câu — cho thí sinh tự đối chiếu ngay sau
  // khi nộp, tránh thắc mắc/hoang mang không biết bài mình có được ghi nhận
  // đủ hay không (đặc biệt sau các ca bị auto-nộp do vi phạm).
  const [answerStats, setAnswerStats] = useState<{ answered: number; total: number } | null>(
    null
  );

  useEffect(() => {
    // Cookie phiên thi vẫn còn (nếu vừa nộp từ /exam/take) nên vẫn lấy được
    // thông tin thí sinh để hiển thị lại; nếu không (VD vào lại bằng mã đã
    // nộp từ trước, không có cookie) thì bỏ qua, không hiện khối này.
    fetch("/api/exam/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.student) setStudent(json.student);
        if (Array.isArray(json?.questions)) {
          const answered = (json.answers ?? []).filter(
            (a: { selected_options: number[] }) => (a.selected_options?.length ?? 0) > 0
          ).length;
          setAnswerStats({ answered, total: json.questions.length });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4 shadow-sm animate-scale-in">
        {isViolation ? (
          <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-2xl bg-amber-100 text-amber-600 animate-shake-once">
            !
          </div>
        ) : (
          /* Checkmark vẽ nét — vòng tròn trước, tick sau (stroke-dashoffset). */
          <svg
            className="mx-auto h-14 w-14 text-emerald-500"
            viewBox="0 0 56 56"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="checkmark-circle"
              cx="28"
              cy="28"
              r="26"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="checkmark-check"
              d="M17 29l8 8 15-16"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <h1 className="text-lg font-semibold text-slate-900">
          {isViolation ? "Bài thi đã bị nộp tự động" : "Đã nộp bài"}
        </h1>
        {student && (
          <p className="text-sm text-slate-500">
            {student.student_name || "Chưa có tên"} · SBD{" "}
            <span className="font-mono">{student.code}</span>
          </p>
        )}
        <p className="text-sm text-slate-600">{message}</p>

        {answerStats && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium ${
              answerStats.answered === answerStats.total
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            Đã ghi nhận {answerStats.answered}/{answerStats.total} câu trả lời
            {answerStats.answered < answerStats.total && (
              <p className="mt-1 text-xs font-normal">
                Còn {answerStats.total - answerStats.answered} câu chưa kịp trả lời trước khi
                nộp bài.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-slate-400">
          Kết quả sẽ do giám thị/admin công bố. Bạn có thể đóng trang này.
        </p>
      </div>
    </div>
  );
}

export default function ExamDonePage() {
  return (
    <Suspense fallback={null}>
      <DoneContent />
    </Suspense>
  );
}
