"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Footer } from "@/components/shared/Footer";

export default function LandingPage() {
  const router = useRouter();
  const [rulesText, setRulesText] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => setRulesText(json.rules_text ?? ""))
      .catch(() => setRulesText(""));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">
            Hệ thống thi trắc nghiệm online
          </h1>
          <p className="text-sm text-slate-500">
            Nền tảng thi trắc nghiệm dành cho đoàn viên thanh niên
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Quy chế dự thi</h2>
          {rulesText === null ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : rulesText.trim() ? (
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {rulesText}
            </div>
          ) : (
            <ul className="text-sm text-slate-700 space-y-1.5 list-disc list-inside">
              <li>Không chuyển sang tab hoặc ứng dụng khác trong lúc làm bài.</li>
              <li>Không thoát chế độ toàn màn hình khi đang thi (nếu đề bật giám sát).</li>
              <li>Làm bài trung thực, không nhờ người khác làm hộ.</li>
              <li>Bài thi sẽ tự động nộp khi hết giờ hoặc vi phạm vượt số lần cho phép.</li>
              <li>Kiểm tra kỹ mạng và pin thiết bị trước khi bắt đầu.</li>
            </ul>
          )}
        </div>

        <label className="flex items-start gap-2 bg-white border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="h-4 w-4 mt-0.5"
          />
          <span>Tôi đã đọc và đồng ý tuân thủ quy chế dự thi ở trên.</span>
        </label>

        <button
          onClick={() => router.push("/portal")}
          disabled={!agreed}
          className="w-full rounded-lg bg-slate-900 text-white text-base font-medium py-3 hover:bg-slate-800 disabled:opacity-40"
        >
          Tiếp tục
        </button>

        <Footer />
      </div>
    </div>
  );
}
