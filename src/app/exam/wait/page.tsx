"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ExamSummary = {
  name: string;
  duration_minutes: number;
  max_violations: number;
  monitoring_enabled: boolean;
  total_questions: number;
};

type StudentSummary = {
  code: string;
  student_name: string | null;
};

export default function ExamWaitPage() {
  const router = useRouter();
  const [exam, setExam] = useState<ExamSummary | null>(null);
  const [student, setStudent] = useState<StudentSummary | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("exam_summary");
    const studentRaw = sessionStorage.getItem("exam_student");
    const code = sessionStorage.getItem("exam_code");
    const examId = sessionStorage.getItem("exam_id");
    if (!raw || !code || !examId) {
      router.replace("/exam");
      return;
    }
    setExam(JSON.parse(raw));
    if (studentRaw) setStudent(JSON.parse(studentRaw));
  }, [router]);

  async function handleStart() {
    const code = sessionStorage.getItem("exam_code");
    const examId = sessionStorage.getItem("exam_id");
    if (!code || !examId) {
      router.replace("/exam");
      return;
    }
    setStarting(true);
    setError(null);

    // Thử bật fullscreen ngay trong lúc có user gesture (bấm nút). Không chặn
    // luồng nếu trình duyệt không hỗ trợ (VD Chrome trên iOS) — chỉ ghi nhận.
    let fullscreenSupported = false;
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        fullscreenSupported = true;
      }
    } catch {
      fullscreenSupported = false;
    }
    sessionStorage.setItem("fullscreen_supported", String(fullscreenSupported));

    try {
      const res = await fetch("/api/exam/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam_id: examId, code }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      sessionStorage.removeItem("exam_summary");
      sessionStorage.removeItem("exam_code");
      sessionStorage.removeItem("exam_id");
      router.push("/exam/take");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      setStarting(false);
    }
  }

  if (!exam) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">{exam.name}</h1>
          <p className="text-sm text-slate-500">Kiểm tra thông tin trước khi bắt đầu</p>
        </div>

        {student && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-center">
            <p className="text-xs text-blue-600">Thí sinh</p>
            <p className="text-base font-semibold text-slate-900">
              {student.student_name || "Chưa có tên trong hệ thống"}
            </p>
            <p className="text-sm text-slate-600">
              Số báo danh:{" "}
              <span className="font-mono font-semibold tracking-wider">{student.code}</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Kiểm tra đúng tên và số báo danh của mình trước khi bắt đầu. Nếu sai, liên hệ
              giám thị ngay, không tự ý làm bài.
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-3 text-center">
          <div className="bg-slate-50 rounded-lg py-3">
            <dt className="text-xs text-slate-500">Thời gian</dt>
            <dd className="text-lg font-semibold text-slate-900">
              {exam.duration_minutes} phút
            </dd>
          </div>
          <div className="bg-slate-50 rounded-lg py-3">
            <dt className="text-xs text-slate-500">Số câu</dt>
            <dd className="text-lg font-semibold text-slate-900">{exam.total_questions}</dd>
          </div>
          <div className="bg-slate-50 rounded-lg py-3 col-span-2">
            <dt className="text-xs text-slate-500">Số lần vi phạm cho phép</dt>
            <dd className="text-lg font-semibold text-slate-900">
              {exam.max_violations} lần
            </dd>
          </div>
        </dl>

        <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
          <li>Đảm bảo mạng ổn định và pin đủ dùng.</li>
          <li>Không thoát ứng dụng hoặc chuyển sang tab/app khác trong lúc thi.</li>
          {exam.monitoring_enabled && (
            <li>Ứng dụng sẽ chuyển sang toàn màn hình và theo dõi việc rời khỏi bài thi.</li>
          )}
          <li>Thời gian bắt đầu tính ngay khi bạn bấm nút bên dưới.</li>
        </ul>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full rounded-lg bg-slate-900 text-white text-base font-medium py-3 hover:bg-slate-800 disabled:opacity-50"
        >
          {starting ? "Đang bắt đầu..." : "Bắt đầu làm bài"}
        </button>
      </div>
    </div>
  );
}
