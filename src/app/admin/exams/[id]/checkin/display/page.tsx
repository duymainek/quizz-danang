"use client";

import { use, useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * P6 — Màn hình QR check-in toàn màn hình để BTC chiếu ở cửa phòng thi.
 * Token rotate liên tục; QR encode URL /checkin?token=...
 */
export default function CheckinDisplayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/checkin`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      if (!json.enabled || !json.token) {
        setError("Check-in đang tắt cho đề này — bật trong tab Check-in.");
        setQrDataUrl(null);
        return;
      }
      setError(null);
      const url = `${window.location.origin}/checkin?token=${json.token}`;
      const dataUrl = await QRCode.toDataURL(url, { width: 480, margin: 1 });
      setQrDataUrl(dataUrl);
      setSecondsLeft(
        Math.max(0, Math.round((new Date(json.expires_at).getTime() - Date.now()) / 1000))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được mã QR");
    }
  }, [examId]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 3000);
    const tick = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [refresh]);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl md:text-4xl font-bold text-center">
        Quét mã để check-in rời phòng
      </h1>
      <p className="text-slate-400 text-center max-w-md">
        Sau khi nộp bài, dùng chính điện thoại đã làm bài để quét mã này trước khi rời
        phòng thi.
      </p>
      {error ? (
        <p className="text-amber-400 text-lg">{error}</p>
      ) : qrDataUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR check-in"
            className="rounded-2xl bg-white p-3 w-[min(70vw,480px)] animate-scale-in"
          />
          <p className="text-slate-500 text-sm font-mono">
            Mã tự đổi sau {secondsLeft}s
          </p>
        </>
      ) : (
        <p className="text-slate-500 animate-soft-pulse">Đang tạo mã…</p>
      )}
    </div>
  );
}
