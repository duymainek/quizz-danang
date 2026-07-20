"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Exam = {
  id: string;
  name: string;
  duration_minutes: number;
  max_violations: number;
  monitoring_enabled: boolean;
  total_questions: number;
  student_codes_count: number;
  subjects: { name: string } | null;
};

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/exams");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setExams(json.exams);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Xóa đề thi này?")) return;
    const res = await fetch(`/api/admin/exams/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Đề thi</h1>
          <p className="text-sm text-slate-500">
            Ghép từ các tệp câu hỏi, cấu hình số câu rút ngẫu nhiên cho mỗi tệp.
          </p>
        </div>
        <Link
          href="/admin/exams/new"
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
        >
          + Tạo đề thi
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : exams.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có đề thi nào.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {exams.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  href={`/admin/exams/${e.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {e.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {e.subjects?.name} · {e.total_questions} câu · {e.duration_minutes} phút ·
                  {" "}
                  {e.monitoring_enabled ? "có giám sát" : "không giám sát"} ·{" "}
                  {e.student_codes_count} mã số đã sinh
                </p>
              </div>
              {e.student_codes_count === 0 && (
                <button
                  onClick={() => handleDelete(e.id)}
                  className="text-sm text-red-600 hover:underline"
                >
                  Xóa
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
