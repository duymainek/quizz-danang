"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * P6 — Trang thí sinh mở khi quét QR check-in.
 * Tự động gửi token — thí sinh không phải nhập gì (device bind qua cookie).
 */
function CheckinContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Đang check-in…");
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    if (!token) {
      setState("error");
      setMessage("Thiếu mã QR — vui lòng quét lại mã trên màn hình phòng thi.");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/exam/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Check-in thất bại");
        setState("ok");
        setMessage(json.message ?? "Check-in thành công.");
      } catch (e) {
        setState("error");
        setMessage(e instanceof Error ? e.message : "Check-in thất bại, vui lòng thử lại");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-4 shadow-sm animate-scale-in">
        {state === "working" && (
          <p className="text-sm text-slate-500 animate-soft-pulse">Đang check-in…</p>
        )}
        {state === "ok" && (
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
            <h1 className="text-lg font-semibold text-slate-900">Đã check-in</h1>
            <p className="text-sm text-slate-600">{message}</p>
          </>
        )}
        {state === "error" && (
          <>
            <div className="mx-auto h-14 w-14 rounded-full flex items-center justify-center text-2xl bg-amber-100 text-amber-600 animate-shake-once">
              !
            </div>
            <p className="text-sm text-slate-600">{message}</p>
            <Link href="/portal" className="text-sm text-slate-500 underline">
              Về trang đề thi của tôi
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={null}>
      <CheckinContent />
    </Suspense>
  );
}
