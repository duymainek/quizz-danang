"use client";


import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

type Exam = {
  id: string;
  name: string;
  duration_minutes: number;
  max_violations: number;
  monitoring_enabled: boolean;
  is_active: boolean;
  total_questions: number;
  student_codes_count: number;
};

export default function ExamsPage() {
  // Cache: quay lại trang hiện data ngay, revalidate nền.
  const { data, error, reload, isLoading: loading } = useCachedFetch<{ exams: Exam[] }>(
    "/api/admin/exams"
  );
  const exams = data?.exams ?? [];
  const load = reload;

  async function handleDuplicate(id: string) {
    const res = await fetch(`/api/admin/exams/${id}/duplicate`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    await load();
  }

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
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full animate-shimmer" />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có đề thi nào.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {exams.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/exams/${e.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {e.name}
                  </Link>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      e.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {e.is_active ? "Đang mở" : "Chưa mở"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {e.total_questions} câu · {e.duration_minutes} phút ·{" "}
                  {e.monitoring_enabled ? "có giám sát" : "không giám sát"} ·{" "}
                  {e.student_codes_count} mã số đã sinh
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleDuplicate(e.id)}
                  className="text-sm text-slate-500 hover:text-slate-900 hover:underline"
                  title="Tạo bản sao cấu hình đề (không copy thí sinh/kết quả)"
                >
                  Nhân bản
                </button>
                {e.student_codes_count === 0 && (
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
