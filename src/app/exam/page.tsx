"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ExamLoginPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
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
        sessionStorage.setItem("exam_code", code.trim());
        router.push("/exam/wait");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm"
      >
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold text-slate-900">Vào phòng thi</h1>
          <p className="text-sm text-slate-500">Nhập mã số thí sinh được cấp để bắt đầu.</p>
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
          disabled={submitting || !code.trim()}
          className="w-full rounded-lg bg-slate-900 text-white text-base font-medium py-3 hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Đang kiểm tra..." : "Vào thi"}
        </button>
      </form>
    </div>
  );
}
