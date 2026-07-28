"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Footer } from "@/components/shared/Footer";

type StudentSummary = { code: string; full_name: string | null };

type ExamRow = {
  exam_id: string;
  name: string;
  duration_minutes: number;
  is_active: boolean;
  monitoring_enabled: boolean;
  assignment_status: "unused" | "in_progress" | "submitted" | "reset";
  submitted_at: string | null;
  publish_score: boolean;
  total_score: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  unused: "Chưa làm",
  in_progress: "Đang làm dở",
  submitted: "Đã nộp",
  reset: "Đã được reset — có thể làm lại",
};

export default function PortalPage() {
  const router = useRouter();
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [exams, setExams] = useState<ExamRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entering, setEnteringId] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/student/me");
      if (res.status === 401) {
        setStudent(null);
        setExams(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStudent(json.student);
      setExams(json.exams);
    } catch {
      setStudent(null);
      setExams(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoggingIn(true);
    setError(null);
    try {
      // Fingerprint thu âm thầm — lỗi cũng không chặn đăng nhập.
      let fingerprint: Record<string, unknown> | null = null;
      try {
        const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        fingerprint = {
          visitor_id: result.visitorId,
          screen: `${window.screen.width}x${window.screen.height}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          platform: navigator.platform,
        };
      } catch {
        // ignore
      }
      const res = await fetch("/api/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), fingerprint }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await loadMe();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/student/logout", { method: "POST" });
    setStudent(null);
    setExams(null);
    setCode("");
  }

  async function handleEnter(examId: string) {
    setEnteringId(examId);
    setError(null);
    try {
      const res = await fetch("/api/exam/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: examId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      if (json.phase === "submitted") {
        router.push("/exam/done?reason=already");
      } else if (json.phase === "in_progress") {
        router.push("/exam/take");
      } else {
        sessionStorage.setItem("exam_summary", JSON.stringify(json.exam));
        sessionStorage.setItem("exam_student", JSON.stringify(json.student));
        sessionStorage.setItem("exam_id", examId);
        router.push("/exam/wait");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      setEnteringId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Đang tải...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 gap-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm"
        >
          <div className="text-center space-y-1">
            <h1 className="text-lg font-semibold text-slate-900">Nhập mã số của bạn</h1>
            <p className="text-sm text-slate-500">
              Mã số cá nhân dùng chung cho tất cả các đề thi bạn được phân công.
            </p>
          </div>

          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Nhập mã số"
            autoFocus
            className="w-full text-center text-lg tracking-widest font-mono rounded-lg border border-slate-300 px-4 py-3 text-slate-900 placeholder:text-slate-400 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-slate-900"
          />

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-center">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loggingIn || !code.trim()}
            className="w-full rounded-lg bg-slate-900 text-white text-base font-medium py-3 hover:bg-slate-800 disabled:opacity-50"
          >
            {loggingIn ? "Đang kiểm tra..." : "Vào trang cá nhân"}
          </button>

          <Link href="/landing" className="block text-center text-sm text-slate-500 hover:underline">
            ← Xem lại quy chế dự thi
          </Link>
        </form>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Xin chào</p>
            <h1 className="text-lg font-semibold text-slate-900">
              {student.full_name || "Thí sinh"}{" "}
              <span className="font-mono text-sm text-slate-500">({student.code})</span>
            </h1>
          </div>
          <button onClick={handleLogout} className="text-sm text-slate-500 hover:underline">
            Đăng xuất
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-center">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700">Đề thi của bạn</h2>
        </div>

        {!exams || exams.length === 0 ? (
          <p className="text-sm text-slate-500 text-center bg-white border border-slate-200 rounded-xl p-6">
            Bạn chưa được gán vào đề thi nào. Vui lòng liên hệ giám thị.
          </p>
        ) : (
          <ul className="space-y-3 stagger">
            {exams.map((e) => {
              const disabled = !e.is_active && e.assignment_status !== "in_progress";
              return (
                <li
                  key={e.exam_id}
                  className={`bg-white border rounded-xl p-4 transition-colors animate-fade-up ${
                    disabled ? "border-slate-200 opacity-50" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{e.name}</p>
                    </div>
                    {disabled && (
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        Chưa mở
                      </span>
                    )}
                  </div>

                  <div className="flex gap-3 mt-2 text-xs text-slate-500">
                    <span>{e.duration_minutes} phút</span>
                    {e.monitoring_enabled && (
                      <>
                        <span>·</span>
                        <span>Có giám sát</span>
                      </>
                    )}
                  </div>

                  {e.assignment_status === "submitted" && (
                    <p className="mt-2 text-sm text-slate-600">
                      {STATUS_LABEL.submitted}
                      {e.publish_score && e.total_score !== null && (
                        <span className="font-semibold text-slate-900">
                          {" "}
                          — Điểm: {e.total_score.toFixed(2)}
                        </span>
                      )}
                      {!e.publish_score && (
                        <span className="text-slate-400"> — Đề này không công bố điểm</span>
                      )}
                    </p>
                  )}

                  {!disabled && e.assignment_status !== "submitted" && (
                    <button
                      onClick={() => handleEnter(e.exam_id)}
                      disabled={entering === e.exam_id}
                      className="mt-3 w-full rounded-lg bg-slate-900 text-white text-sm font-medium py-2.5 hover:bg-slate-800 disabled:opacity-50 transition-all duration-150 active:scale-[0.98]"
                    >
                      {entering === e.exam_id
                        ? "Đang vào..."
                        : e.assignment_status === "in_progress"
                          ? "Tiếp tục làm bài"
                          : "Vào thi"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Footer />
      </div>
    </div>
  );
}
