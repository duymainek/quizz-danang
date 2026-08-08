"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { OfflineSync, type SaveState } from "@/lib/exam/offline-sync";
import { CheckinScanner } from "@/components/exam/CheckinScanner";

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
  checkin_enabled: boolean;
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
  const [showCheckin, setShowCheckin] = useState(false);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [warning, setWarning] = useState<{ message: string; remaining: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Khoá tạm màn hình câu hỏi ngay khi PHÁT HIỆN vi phạm ở trình duyệt (trước
  // cả khi có phản hồi server) — tránh khoảng hở thí sinh vẫn chọn thêm đáp
  // án trong lúc chờ, các lựa chọn đó chắc chắn bị server từ chối vì đề đã
  // kết thúc, gây hiểu lầm "mất kết nối" trong khi bản chất là bài đã bị cắt.
  const [checkingViolation, setCheckingViolation] = useState(false);
  // Luồng auto-nộp do vi phạm: thông báo ngay -> animation nộp bài -> xác
  // nhận thành công (có nút thử lại nếu mất mạng lúc xác nhận).
  const [autoSubmitPhase, setAutoSubmitPhase] = useState<
    "notice" | "verifying" | "success" | "error" | null
  >(null);
  const [autoSubmitLabel, setAutoSubmitLabel] = useState("");
  const submittedRef = useRef(false);
  const lastViolationAtRef = useRef<Record<string, number>>({});
  const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const failedSaveQuestionsRef = useRef<Set<string>>(new Set());
  const syncRef = useRef<OfflineSync | null>(null);

  /** Log qua offline queue nếu đã init, fallback fire-and-forget lúc chưa init. */
  const log = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (syncRef.current) syncRef.current.logEvent(type, payload);
    else logEvent(type, payload);
  }, []);

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

      // P1 — Khởi tạo offline sync theo mã thí sinh (1 phiên active / thí sinh).
      const sync = syncRef.current ?? new OfflineSync(json.student.code);
      syncRef.current = sync;
      sync.onState(setSaveState);
      // Server từ chối lưu đáp án vì bài thi đã kết thúc (vi phạm/hết giờ vừa
      // xảy ra ở 1 request khác) — không phải mất mạng. Trước đây trường hợp
      // này bị hiểu nhầm thành "Mất kết nối" và cứ lặng lẽ thử lại vô ích,
      // trong khi màn hình câu hỏi vẫn hiện cho thí sinh chọn tiếp — các lựa
      // chọn đó không bao giờ được lưu. Giờ chủ động khoá màn hình + báo rõ
      // lý do ngay khi phát hiện.
      sync.onExamEnded(() => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        log("exam_ended_detected_via_answer_save");
        setAutoSubmitLabel("Bài thi đã kết thúc");
        setAutoSubmitPhase("notice");
      });

      const serverAnswers = Object.fromEntries(
        (json.answers as { question_id: string; selected_options: number[] }[]).map(
          (a) => [a.question_id, a.selected_options]
        )
      );
      // Merge đáp án dirty từ phiên trước (chọn lúc mất mạng rồi thoát) —
      // local override server vì là lựa chọn mới hơn, đồng thời gửi bù ngay.
      const dirty = sync.getDirtyAnswers();
      for (const d of dirty) {
        if (json.questions.some((q: Question) => q.id === d.question_id)) {
          serverAnswers[d.question_id] = d.selected_options;
        }
      }
      setAnswers(serverAnswers);
      if (dirty.length > 0) {
        sync.logEvent("offline_answers_recovered", { count: dirty.length });
        void sync.flushAll();
      }

      logEvent("session_loaded", {
        total_questions: json.questions?.length ?? 0,
        already_answered: (json.answers ?? []).length,
      });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được đề thi");
    } finally {
      setLoading(false);
    }
  }, [router, log]);

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

    // Khoá màn hình NGAY LẬP TỨC (trước khi biết kết quả từ server) — nếu vi
    // phạm này không đủ để auto-submit thì mở khoá lại ngay khi có phản hồi.
    setCheckingViolation(true);
    try {
      const res = await fetch("/api/exam/violation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCheckingViolation(false);
        return;
      }
      if (json.auto_submitted) {
        // Server ĐÃ chấm điểm + đổi trạng thái sang auto_submitted ngay trong
        // request này rồi — không im lặng chuyển trang nữa. Báo cho thí sinh
        // biết lý do, rồi chạy qua animation xác nhận nộp bài (có retry nếu
        // bước xác nhận bị mất mạng).
        submittedRef.current = true;
        log("auto_submit_triggered", { violation_type: type });
        setAutoSubmitLabel(VIOLATION_LABEL[type] ?? "Phát hiện vi phạm");
        setAutoSubmitPhase("notice");
        return;
      }
      // Vi phạm chưa đủ để auto-submit (còn lượt) — mở khoá màn hình lại.
      setCheckingViolation(false);
      setWarning({
        message: VIOLATION_LABEL[type] ?? "Phát hiện vi phạm",
        remaining: json.remaining,
      });
    } catch {
      // Mất mạng lúc gửi vi phạm — không chặn thí sinh; ghi vào offline queue
      // (FIFO, có seq) để server vẫn nhận được bản ghi đúng thứ tự khi có mạng.
      setCheckingViolation(false);
      syncRef.current?.logEvent("violation_send_failed", { violation_type: type });
    }
  }, [log]);

  /** Xác nhận lại trạng thái phiên sau khi server báo auto-submit do vi phạm.
   * Vòng gọi API riêng (không chỉ tin response của /api/exam/violation) để
   * animation "đang nộp bài" có ý nghĩa thật + có thể retry khi mất mạng. */
  const verifyAutoSubmit = useCallback(async () => {
    setAutoSubmitPhase("verifying");
    try {
      const res = await fetch("/api/exam/session");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không xác nhận được trạng thái nộp bài");
      if (json.status === "in_progress") throw new Error("Chưa cập nhật trạng thái, thử lại");
      log("auto_submit_verified", { status: json.status });
      setAutoSubmitPhase("success");
      setTimeout(() => router.replace("/exam/done?reason=auto_submitted"), 1100);
    } catch {
      setAutoSubmitPhase("error");
    }
  }, [router, log]);

  // Sau khi hiện thông báo "phát hiện vi phạm" một nhịp ngắn để thí sinh kịp
  // đọc, tự động chuyển sang bước xác nhận nộp bài.
  useEffect(() => {
    if (autoSubmitPhase !== "notice") return;
    const t = setTimeout(() => void verifyAutoSubmit(), 1400);
    return () => clearTimeout(t);
  }, [autoSubmitPhase, verifyAutoSubmit]);

  // Hủy timer/listener của offline sync khi rời trang.
  useEffect(() => {
    return () => syncRef.current?.destroy();
  }, []);

  // Theo dõi mất/có mạng — chỉ để log lại mốc thời gian, không tự làm gì
  // khác (autosave đã tự retry ở lần chọn tiếp theo, submit tự retry qua nút).
  useEffect(() => {
    if (!data) return;
    const onOnline = () => log("network_online");
    const onOffline = () => log("network_offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [data, log]);

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
    const sync = syncRef.current;
    if (!sync) return;
    // P1 — lưu localStorage trước, gửi API sau; lỗi thì tự retry backoff.
    const ok = await sync.saveAnswer(questionId, selected);
    if (ok) {
      if (failedSaveQuestionsRef.current.has(questionId)) {
        failedSaveQuestionsRef.current.delete(questionId);
        sync.logEvent("answer_save_recovered", { question_id: questionId });
      }
    } else {
      failedSaveQuestionsRef.current.add(questionId);
      sync.logEvent("answer_save_failed", {
        question_id: questionId,
        selected_options: selected,
        online: typeof navigator !== "undefined" ? navigator.onLine : null,
      });
    }
  }

  function toggleOption(question: Question, optionIdx: number) {
    // Đang chờ server xác nhận 1 vi phạm vừa phát hiện — chặn chọn thêm để
    // tránh lựa chọn chắc chắn bị từ chối (bài có thể đã kết thúc), tránh
    // hiện tượng "chọn được nhưng không bao giờ lưu, báo nhầm mất kết nối".
    if (checkingViolation) return;
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
    log(isFirstSelect ? "answer_first_select" : "answer_change", {
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

  /** Gọi API nộp bài thật sự. Dùng cho cả nộp chủ động (sau khi check-in xong,
   * hoặc ngay lập tức nếu check-in đang tắt) lẫn auto-submit (hết giờ). */
  async function submitToServer(auto: boolean, reason?: string) {
    // KHÔNG dùng window.confirm()/alert() ở đây: dialog gốc của trình duyệt
    // làm trang mất focus (kích hoạt 'blur'/'visibilitychange'), khiến hệ
    // thống hiểu nhầm thành hành vi vi phạm ngay khi thí sinh đang nộp bài
    // hợp lệ. Dùng modal tự vẽ (showSubmitConfirm) thay thế.
    const answeredCount = Object.keys(answers).filter((k) => (answers[k]?.length ?? 0) > 0).length;
    setSubmitting(true);
    setSubmitError(false);
    log("submit_attempt", {
      auto,
      answered_count: answeredCount,
      total_questions: data?.questions.length ?? 0,
      pending_failed_saves: Array.from(failedSaveQuestionsRef.current),
    });
    try {
      // P1 — flush hết đáp án dirty trước khi nộp (best-effort, không chặn quá lâu).
      await syncRef.current?.flushAll();
      // Submit LUÔN realtime — chỉ coi là đã nộp khi server xác nhận.
      const res = await fetch("/api/exam/submit", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      log("submit_success", { auto });
      syncRef.current?.clear();
      router.replace(`/exam/done?reason=${reason ?? (auto ? "timeout" : "manual")}`);
    } catch (e) {
      // Mất mạng lúc nộp: giữ nguyên màn hình làm bài, banner + tự thử lại.
      log("submit_error", { auto, error: e instanceof Error ? e.message : String(e) });
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError(true);
      setTimeout(() => {
        if (!submittedRef.current) {
          submittedRef.current = true;
          void submitToServer(auto, reason);
        }
      }, 4000);
    }
  }

  /**
   * Điểm vào duy nhất cho nộp bài chủ động/hết giờ.
   * - auto=true (hết giờ): nộp thẳng, KHÔNG bắt check-in.
   * - auto=false (thí sinh bấm nộp) + check-in đang bật cho đề này: chuyển
   *   sang màn hình quét QR, chỉ nộp thật sau khi quét thành công.
   * - Vi phạm bị auto-submit thì server tự xử lý ở /api/exam/violation và
   *   redirect thẳng — không đi qua hàm này, nên cũng không bị chặn bởi check-in.
   */
  async function handleSubmit(auto = false) {
    if (!auto && data?.checkin_enabled) {
      log("checkin_required_before_submit");
      setShowCheckin(true);
      return;
    }
    await submitToServer(auto);
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
          <span
            className={`font-mono font-semibold ${timeColor} ${
              timeLeftMs <= 60_000 ? "animate-timer-pulse" : ""
            }`}
          >
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")} còn lại
          </span>
          <div className="flex items-center gap-3">
            {/* P1 — chỉ báo autosave nhỏ, không xâm lấn */}
            <span
              className="text-xs transition-opacity duration-300"
              title={
                saveState === "saved"
                  ? "Đã lưu"
                  : saveState === "saving"
                    ? "Đang lưu"
                    : "Mất kết nối — đang thử lại"
              }
            >
              {saveState === "saved" && <span className="text-emerald-400">✓ Đã lưu</span>}
              {saveState === "saving" && <span className="text-slate-300">Đang lưu…</span>}
              {saveState === "offline" && (
                <span className="text-amber-400 animate-soft-pulse">Mất kết nối</span>
              )}
            </span>
            <button onClick={() => setShowGrid(true)} className="underline">
              Đã làm {answeredCount}/{data.questions.length} câu
            </button>
          </div>
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

      {checkingViolation && !autoSubmitPhase && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center gap-2 animate-slide-down">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin shrink-0" />
          Đang kiểm tra... tạm khoá chọn đáp án trong giây lát.
        </div>
      )}

      {warning && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700 flex items-center justify-between animate-slide-down">
          <span className="flex items-center gap-2">
            <span className="animate-shake-once inline-block">⚠️</span>
            {warning.message}. Còn {warning.remaining} lần trước khi bị tự động nộp bài.
          </span>
          <button onClick={() => setWarning(null)} className="ml-2 text-red-500">
            ✕
          </button>
        </div>
      )}

      {submitError && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center justify-between animate-slide-down">
          <span>Không thể nộp bài do mất mạng — đang tự động thử lại…</span>
          <button
            onClick={() => {
              if (!submittedRef.current) {
                submittedRef.current = true;
                void handleSubmit(false);
              }
            }}
            className="ml-2 underline font-medium shrink-0"
          >
            Thử lại ngay
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
                      className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-all duration-150 active:scale-[0.98] ${
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
          disabled={submitting}
          className="w-full rounded-xl bg-emerald-600 text-white py-4 text-base font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting
            ? "Đang nộp bài…"
            : `Nộp bài (${answeredCount}/${data.questions.length} câu đã làm)`}
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
          className="fixed inset-0 bg-black/40 z-20 flex items-end animate-fade-in"
          onClick={() => setShowGrid(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-4 max-h-[70vh] overflow-y-auto animate-slide-up"
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
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4 animate-fade-in"
          onClick={() => setShowSubmitConfirm(false)}
        >
          <div
            className="w-full max-w-xs bg-white rounded-2xl p-5 space-y-4 animate-scale-in"
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

      {showCheckin && (
        <CheckinScanner
          onCancel={() => {
            log("checkin_cancelled");
            setShowCheckin(false);
          }}
          onSuccess={() => {
            setShowCheckin(false);
            log("checkin_success");
            void submitToServer(false, "manual");
          }}
          onLog={(type, payload) => log(type, payload)}
        />
      )}

      {autoSubmitPhase && (
        <div className="fixed inset-0 bg-slate-950/80 z-50 flex items-center justify-center px-4 animate-fade-in">
          <div className="w-full max-w-xs bg-white rounded-2xl p-6 text-center space-y-4 animate-scale-in">
            {autoSubmitPhase === "notice" && (
              <>
                <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-2xl bg-amber-100 text-amber-600 animate-shake-once">
                  !
                </div>
                <h1 className="text-base font-semibold text-slate-900">Phát hiện vi phạm</h1>
                <p className="text-sm text-slate-600">{autoSubmitLabel}.</p>
                <p className="text-sm font-medium text-slate-900">
                  Bài thi của bạn sẽ được tự động nộp.
                </p>
              </>
            )}

            {autoSubmitPhase === "verifying" && (
              <>
                <div className="mx-auto h-14 w-14 rounded-full border-4 border-slate-200 border-t-slate-900 animate-spin" />
                <h1 className="text-base font-semibold text-slate-900">Đang nộp bài…</h1>
                <p className="text-sm text-slate-500">Vui lòng đợi trong giây lát.</p>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full w-1/3 rounded-full bg-slate-900 animate-progress-indeterminate" />
                </div>
              </>
            )}

            {autoSubmitPhase === "success" && (
              <>
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
                <h1 className="text-base font-semibold text-slate-900">Nộp bài thành công</h1>
                <p className="text-sm text-slate-500">Đang chuyển trang…</p>
              </>
            )}

            {autoSubmitPhase === "error" && (
              <>
                <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-2xl bg-amber-100 text-amber-600 animate-shake-once">
                  !
                </div>
                <h1 className="text-base font-semibold text-slate-900">Không thể xác nhận nộp bài</h1>
                <p className="text-sm text-slate-500">
                  Bài thi có thể đã được nộp nhưng mất mạng lúc xác nhận lại. Vui lòng thử lại.
                </p>
                <button
                  onClick={() => void verifyAutoSubmit()}
                  className="w-full rounded-lg bg-slate-900 text-white text-sm font-medium py-2.5 hover:bg-slate-800"
                >
                  Thử lại
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
