"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Props = {
  onSuccess: () => void;
  onCancel: () => void;
  onLog?: (type: string, payload?: Record<string, unknown>) => void;
};

type Status = "starting" | "scanning" | "checking" | "error" | "denied";

/**
 * Màn hình bắt buộc trước khi nộp bài (khi đề bật check-in QR): mở camera
 * ngay trong app, tự dò khung hình tìm mã QR do giám thị chiếu, gửi token
 * lên /api/exam/checkin bằng CHÍNH thiết bị đang làm bài. Chỉ khi check-in
 * thành công mới cho phép nộp bài thật sự (page cha tự gọi submit).
 */
export function CheckinScanner({ onSuccess, onCancel, onLog }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState("Đang mở camera…");

  const extractToken = (text: string): string | null => {
    try {
      const url = new URL(text);
      const t = url.searchParams.get("token");
      if (t) return t;
    } catch {
      // Không phải URL đầy đủ — thử regex token=... trực tiếp.
    }
    const m = text.match(/token=([A-Za-z0-9_-]{8,64})/);
    return m ? m[1] : null;
  };

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });

    if (code && !busyRef.current) {
      const token = extractToken(code.data);
      if (token) {
        busyRef.current = true;
        setStatus("checking");
        setMessage("Đang xác nhận check-in…");
        void submitCheckin(token);
        return; // không schedule frame tiếp — chờ kết quả API
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, []);

  async function submitCheckin(token: string) {
    try {
      const res = await fetch("/api/exam/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      if (!res.ok) {
        onLog?.("checkin_scan_rejected", { status: res.status, error: json.error });
        setStatus("error");
        setMessage(json.error ?? "Check-in thất bại, thử quét lại");
        busyRef.current = false;
        rafRef.current = requestAnimationFrame(scanFrame);
        return;
      }
      onLog?.("checkin_scan_ok");
      onSuccess();
    } catch {
      onLog?.("checkin_scan_network_error");
      setStatus("error");
      setMessage("Mất mạng lúc check-in — thử quét lại");
      busyRef.current = false;
      rafRef.current = requestAnimationFrame(scanFrame);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setStatus("scanning");
        setMessage("Hướng camera vào mã QR trên màn hình phòng thi");
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch {
        if (cancelled) return;
        setStatus("denied");
        setMessage(
          "Không mở được camera — vui lòng cho phép quyền camera cho trình duyệt rồi thử lại"
        );
        onLog?.("checkin_camera_denied");
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function retry() {
    setStatus("scanning");
    setMessage("Hướng camera vào mã QR trên màn hình phòng thi");
    busyRef.current = false;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(scanFrame);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold text-center">Check-in trước khi nộp bài</h1>
      <p className="text-sm text-slate-400 text-center max-w-xs">
        Đề thi này yêu cầu quét mã QR trên màn hình phòng thi trước khi nộp bài.
      </p>

      <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
          autoPlay
        />
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-6 border-2 border-emerald-400/70 rounded-xl" />
        {status === "checking" && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <p className="text-sm animate-soft-pulse">Đang xác nhận…</p>
          </div>
        )}
      </div>

      <p
        className={`text-sm text-center max-w-xs ${
          status === "error" || status === "denied" ? "text-amber-400" : "text-slate-300"
        }`}
      >
        {message}
      </p>

      <div className="flex gap-3">
        {(status === "error" || status === "denied") && (
          <button
            onClick={retry}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium"
          >
            Thử lại
          </button>
        )}
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
        >
          Quay lại làm bài
        </button>
      </div>
    </div>
  );
}
