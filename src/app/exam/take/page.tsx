"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Ghi log âm thầm (fire-and-forget) — không await ở nơi gọi, không throw,
 * không bao giờ chặn thao tác của thí sinh. Chỉ để trace lại sau này khi có
 * sự cố mạng/khiếu nại (xem migration 0007_session_events).
 */
function logEvent(type: string, payload: Record<string, unknown> = {}) {
  try {
    fetch("/api/exam/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, client_time: new Date().toISOString() }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Không bao giờ để việc ghi log làm gián đoạn trải nghiệm làm bài.
  }
}

type Question = {
  id: string;
  content: string;
  type: "single" | "multi";
  options: string[];
};

type SessionData = {
  status: string;
  deadline_at: string;
  exam_name: string;
  max_violations: number;
  violation_count: number;
  questions: Question[];
  answers: { question_id: string; selected_options: number[] }[];
  student: { code: string; student_name: string | null };
};

const VIOLATION_LABEL: Record<string, string> = {
  tab_hidden: "Bạn vừa rời khỏi màn hình làm bài (chuyển tab/ứng dụng khác)",
  window_blur: "Bạn vừa rời khỏi cửa sổ làm bài",
  fullscreen_exit: "Bạn vừa thoát chế độ toàn màn hình",
  copy_paste: "Phát hiện thao tác copy/paste trong lúc làm bài",
  beforeunload: "Phát hiện cố gắng đóng/tải lại trang",
};

export default function ExamTakePage() {
  const router = useRouter();
  const [data, setData] = useState<SessionData | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [warning, setWarning] = useState<{ message: string; remaining: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const lastViolationAtRef = useRef<Record<string, number>>({});
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const failedSaveQuestionsRef = useRef<Set<string>>(new Set());

  const loadSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/exam/session");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (json.status !== "in_progress") {
        router.replace(`/exam/done?reason=${json.status}`);
        return;
      }
      setData(json);
      setActiveId(json.questions?.[0]?.id ?? null);
      setAnswers(
        Object.fromEntries(
          (json.answers as { question_id: string; selected_options: number[] }[]).map(
            (a) => [a.question_id, a.selected_options]
          )
        )
      );
      logEvent("session_loaded", {
        total_questions: json.questions?.length ?? 0,
        already_answered: (json.answers ?? []).length,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được đề thi");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Đồng hồ đếm ngược — tính từ deadline_at tuyệt đối do server trả về.
  useEffect(() => {
    if (!data) return;
    const deadline = new Date(data.deadline_at).getTime();
    const tick = () => {
      const remaining = deadline - Date.now();
      setTimeLeftMs(remaining);
      if (remaining <= 0 && !submittedRef.current) {
        submittedRef.current = true;
        void handleSubmit(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Theo dõi câu hỏi nào đang hiện trong khung nhìn để highlight đúng chip
  // trên thanh điều hướng sticky — giúp thí sinh luôn biết đang ở câu nào
  // khi cuộn danh sách dài, không cần lật từng trang.
  useEffect(() => {
    if (!data) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target instanceof HTMLElement) {
          const id = visible.target.dataset.questionId;
          if (id) setActiveId(id);
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );
    Object.values(questionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  const sendViolation = useCallback(async (type: string) => {
    const now = Date.now();
    const last = lastViolationAtRef.current[type] ?? 0;
    if (now - last < 1500) return; // debounce cùng loại vi phạm trong 1.5s
    lastViolationAtRef.current[type] = now;

    try {
      const res = await fetch("/api/exam/violation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!res.ok) return;
      if (json.auto_submitted) {
        submittedRef.current = true;
        router.replace("/exam/done?reason=auto_submitted");
        return;
      }
      setWarning({
        message: VIOLATION_LABEL[type] ?? "Phát hiện vi phạm",
        remaining: json.remaining,
      });
    } catch {
      // Mất mạng lúc gửi log vi phạm — bỏ qua, không chặn thí sinh làm bài tiếp.
    }
  }, [router]);

  // Theo dõi mất/có mạng — chỉ để log lại mốc thời gian, không tự làm gì
  // khác (autosave đã tự retry ở lần chọn tiếp theo, submit tự retry qua nút).
  useEffect(() => {
    if (!data) return;
    const onOnline = () => logEvent("network_online");
    const onOffline = () => logEvent("network_offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;

    const onVisibility = () => {
      if (document.hidden) void sendViolation("tab_hidden");
    };
    const onBlur = () => void sendViolation("window_blur");
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) void sendViolation("fullscreen_exit");
    };
    const onCopyPaste = () => void sendViolation("copy_paste");
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void sendViolation("beforeunload");
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopyPaste);
    document.addEventListener("paste", onCopyPaste);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopyPaste);
      document.removeEventListener("paste", onCopyPaste);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [data, sendViolation]);

  async function saveAnswer(questionId: string, selected: number[]) {
    setAnswers((a) => ({ ...a, [questionId]: selected }));
    try {
      const res = await fetch("/api/exam/answer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: questionId, selected_options: selected }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (failedSaveQuestionsRef.current.has(questionId)) {
        failedSaveQuestionsRef.current.delete(questionId);
        logEvent("answer_save_recovered", { question_id: questionId });
      }
    } catch (e) {
      // Lưu local vẫn giữ nguyên, sẽ gửi lại lần chọn tiếp theo hoặc khi nộp bài.
      // Ghi log lại để admin trace được nếu thí sinh khiếu nại mất đáp án do mạng.
      failedSaveQuestionsRef.current.add(questionId);
      logEvent("answer_save_failed", {
        question_id: questionId,
        selected_options: selected,
        error: e instanceof Error ? e.message : String(e),
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
      });
    }
  }

  function toggleOption(question: Question, optionIdx: number) {
    const current = answers[question.id] ?? [];
    const isFirstSelect = current.length === 0;
    let next: number[];
    if (question.type === "single") {
      next = [optionIdx];
    } else {
      next = current.includes(optionIdx)
        ? current.filter((i) => i !== optionIdx)
        : [...current, optionIdx].sort();
    }
    logEvent(isFirstSelect ? "answer_first_select" : "answer_change", {
      question_id: question.id,
      previous_selected: current,
      new_selected: next,
    });
    void saveAnswer(question.id, next);
  }

  function scrollToQuestion(id: string) {
    questionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    setShowGrid(false);
  }

  async function handleSubmit(auto = false) {
    // KHÔNG dùng window.confirm()/alert() ở đây: dialog gốc của trình duyệt
    // làm trang mất focus (kích hoạt 'blur'/'visibilitychange'), khiến hệ
    // thống hiểu nhầm thành hành vi vi phạm ngay khi thí sinh đang nộp bài
    // hợp lệ. Dùng modal tự vẽ (showSubmitConfirm) thay thế.
    const answeredCount = Object.keys(answers).filter((k) => (answers[k]?.length ?? 0) > 0).length;
    logEvent("submit_attempt", {
      auto,
      answered_count: answeredCount,
      total_questions: data?.questions.length ?? 0,
      pending_failed_saves: Array.from(failedSaveQuestionsRef.current),
    });
    try {
      const res = await fetch("/api/exam/submit", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      logEvent("submit_success", { auto });
    } catch (e) {
      logEvent("submit_error", { auto, error: e instanceof Error ? e.message : String(e) });
    } finally {
      router.replace(`/exam/done?reason=${auto ? "timeout" : "manual"}`);
    }
  }

  function requestSubmit() {
    setShowSubmitConfirm(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Đang tải đề thi...</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-3">
          {loadError ?? "Có lỗi xảy ra"}
        </p>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).filter((k) => (answers[k]?.length ?? 0) > 0).length;
  const minutes = Math.max(0, Math.floor(timeLeftMs / 60000));
  const seconds = Math.max(0, Math.floor((timeLeftMs % 60000) / 1000));
  const timeColor =
    timeLeftMs <= 60_000 ? "text-red-400" : timeLeftMs <= 5 * 60_000 ? "text-amber-400" : "text-white";

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-slate-900 text-white">
        <div className="px-4 py-2 flex items-center justify-between text-sm">
          <span className={`font-mono font-semibold ${timeColor}`}>
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")} còn lại
          </span>
          <button onClick={() => setShowGrid(true)} className="underline">
            Đã làm {answeredCount}/{data.questions.length} câu
          </button>
        </div>
        <div className="px-4 pb-2 text-xs text-slate-300 truncate">
          {data.student.student_name || "Chưa có tên"} · SBD{" "}
          <span className="font-mono">{data.student.code}</span>
        </div>

        {/* Thanh điều hướng nhanh — luôn hiển thị, cuộn ngang, màu rõ ràng
            để thí sinh biết ngay câu nào đã làm/chưa làm/đang xem, bấm để
            nhảy thẳng tới câu đó trong danh sách bên dưới. */}
        <div className="bg-slate-800 px-3 py-2 overflow-x-auto">
          <div className="flex gap-1.5 w-max">
            {data.questions.map((q, i) => {
              const done = (answers[q.id]?.length ?? 0) > 0;
              const isActive = activeId === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => scrollToQuestion(q.id)}
                  className={`h-8 w-8 shrink-0 rounded-md text-xs font-semibold flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-white text-slate-900 ring-2 ring-white"
                      : done
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-700 text-slate-300"
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {warning && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700 flex items-center justify-between">
          <span>
            {warning.message}. Còn {warning.remaining} lần trước khi bị tự động nộp bài.
          </span>
          <button onClick={() => setWarning(null)} className="ml-2 text-red-500">
            ✕
          </button>
        </div>
      )}

      {/* Danh sách toàn bộ câu hỏi xếp từ trên xuống dưới — cuộn để xem hết,
          không chia trang/slide. Mỗi câu là 1 khối độc lập, dễ rà soát lại
          trước khi nộp. */}
      <main className="flex-1 p-4 space-y-4 pb-24">
        {data.questions.map((question, qIndex) => {
          const done = (answers[question.id]?.length ?? 0) > 0;
          return (
            <div
              key={question.id}
              data-question-id={question.id}
              ref={(el) => {
                questionRefs.current[question.id] = el;
              }}
              className={`bg-white rounded-xl border p-4 space-y-3 scroll-mt-32 ${
                done ? "border-emerald-200" : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500">
                  Câu {qIndex + 1}/{data.questions.length}
                </span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {done ? "Đã trả lời" : "Chưa trả lời"}
                </span>
              </div>

              <p className="text-xs text-slate-400">
                {question.type === "multi" ? "Chọn nhiều đáp án đúng" : "Chọn 1 đáp án đúng"}
              </p>
              <p className="text-base font-medium text-slate-900">{question.content}</p>

              <div className="space-y-2">
                {question.options.map((opt, idx) => {
                  const selected = (answers[question.id] ?? []).includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleOption(question, idx)}
                      className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-800"
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}. {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <button
          onClick={requestSubmit}
          className="w-full rounded-xl bg-emerald-600 text-white py-4 text-base font-medium"
        >
          Nộp bài ({answeredCount}/{data.questions.length} câu đã làm)
        </button>
      </main>

      {/* Nút nộp bài nổi, luôn với tay được dù đang cuộn ở bất kỳ câu nào. */}
      <button
        onClick={requestSubmit}
        className="fixed bottom-4 right-4 z-10 rounded-full bg-emerald-600 text-white h-14 w-14 shadow-lg flex items-center justify-center text-xs font-semibold"
        aria-label="Nộp bài"
      >
        Nộp
      </button>

      {showGrid && (
        <div
          className="fixed inset-0 bg-black/40 z-20 flex items-end"
          onClick={() => setShowGrid(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-900">
                Danh sách câu hỏi — {answeredCount}/{data.questions.length} đã làm
              </h2>
              <button onClick={() => setShowGrid(false)} className="text-slate-500 text-sm">
                Đóng
              </button>
            </div>
            <div className="grid grid-cols-6 gap-2">
              {data.questions.map((q, i) => {
                const done = (answers[q.id]?.length ?? 0) > 0;
                return (
                  <button
                    key={q.id}
                    onClick={() => scrollToQuestion(q.id)}
                    className={`h-10 rounded-md text-sm font-medium ${
                      activeId === q.id
                        ? "ring-2 ring-slate-900"
                        : done
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <button
              onClick={requestSubmit}
              className="w-full mt-4 rounded-lg bg-emerald-600 text-white py-3 text-sm font-medium"
            >
              Nộp bài ngay
            </button>
          </div>
        </div>
      )}

      {showSubmitConfirm && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
          onClick={() => setShowSubmitConfirm(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-800">
              Nộp bài ngay? Bạn sẽ không thể chỉnh sửa đáp án sau khi nộp.
            </p>
            <p className="text-xs text-slate-500">
              Đã làm {answeredCount}/{data.questions.length} câu.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 py-2 text-sm text-slate-700"
              >
                Quay lại
              </button>
              <button
                onClick={() => {
                  setShowSubmitConfirm(false);
                  handleSubmit(false);
                }}
                className="flex-1 rounded-lg bg-emerald-600 text-white py-2 text-sm font-medium"
              >
                Nộp bài
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
