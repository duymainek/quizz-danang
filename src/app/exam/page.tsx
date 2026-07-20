"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ExamOption = {
  id: string;
  name: string;
  subject_name: string | null;
  duration_minutes: number;
  monitoring_enabled: boolean;
  total_questions: number;
};

export default function ExamPickerPage() {
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/exam/exams")
      .then((r) => r.json())
      .then((json) => {
        if (json.exams) setExams(json.exams);
        else setError(json.error ?? "Có lỗi xảy ra");
      })
      .catch(() => setError("Không tải được danh sách đề thi"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="max-w-md mx-auto space-y-5">
        <div className="text-center space-y-1">
          <h1 className="text-lg font-semibold text-slate-900">Chọn đề thi</h1>
          <p className="text-sm text-slate-500">
            Chọn đúng môn thi bạn được phân công trước khi nhập mã số.
          </p>
        </div>

        {loading && <p className="text-sm text-slate-500 text-center">Đang tải...</p>}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-center">
            {error}
          </p>
        )}

        {!loading && !error && exams.length === 0 && (
          <p className="text-sm text-slate-500 text-center bg-white border border-slate-200 rounded-xl p-6">
            Hiện chưa có đề thi nào đang mở. Vui lòng liên hệ giám thị.
          </p>
        )}

        <ul className="space-y-3">
          {exams.map((e) => (
            <li key={e.id}>
              <Link
                href={`/exam/${e.id}`}
                className="block bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-400 transition-colors"
              >
                <p className="font-semibold text-slate-900">{e.name}</p>
                {e.subject_name && <p className="text-sm text-slate-500">{e.subject_name}</p>}
                <div className="flex gap-3 mt-2 text-xs text-slate-500">
                  <span>{e.duration_minutes} phút</span>
                  <span>·</span>
                  <span>{e.total_questions} câu</span>
                  {e.monitoring_enabled && (
                    <>
                      <span>·</span>
                      <span>Có giám sát</span>
                    </>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
