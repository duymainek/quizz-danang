"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type Row = {
  student_code_id: string;
  code: string;
  student_name: string | null;
  status: string;
  session_id: string | null;
  session_status: string | null;
  total_score: number | null;
  violation_count: number;
  duration_seconds: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  unused: "Chưa bắt đầu",
  in_progress: "Đang thi",
  submitted: "Đã nộp",
  auto_submitted: "Tự động nộp (vi phạm/hết giờ)",
  reset: "Đã reset",
};

type Summary = {
  total_codes: number;
  submitted_count: number;
  average_score: number | null;
  violated_count: number;
  auto_submitted_count: number;
};

export default function ExamResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/exams/${examId}/results`)
      .then((r) => r.json())
      .then((json) => {
        setRows(json.rows);
        setSummary(json.summary);
      })
      .finally(() => setLoading(false));
  }, [examId]);

  const sorted = [...rows].sort((a, b) => {
    const av = a.total_score ?? -1;
    const bv = b.total_score ?? -1;
    return sortDesc ? bv - av : av - bv;
  });

  return (
    <div className="space-y-6">
      <Link href={`/admin/exams/${examId}`} className="text-sm text-slate-500 hover:underline">
        ← Chi tiết đề thi
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Kết quả & báo cáo</h1>
        <a
          href={`/api/admin/exams/${examId}/results/export?format=csv`}
          className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Xuất CSV
        </a>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            ["Tổng số mã", summary.total_codes],
            ["Đã nộp", summary.submitted_count],
            [
              "Điểm trung bình",
              summary.average_score !== null ? summary.average_score.toFixed(2) : "—",
            ],
            ["Có vi phạm", summary.violated_count],
            ["Tự động nộp", summary.auto_submitted_count],
          ].map(([label, value]) => (
            <div key={label as string} className="bg-white border border-slate-200 rounded-lg p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-semibold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Mã số</th>
                <th className="px-4 py-2 font-medium">Tên</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th
                  className="px-4 py-2 font-medium cursor-pointer select-none"
                  onClick={() => setSortDesc((v) => !v)}
                >
                  Điểm {sortDesc ? "↓" : "↑"}
                </th>
                <th className="px-4 py-2 font-medium">Thời gian làm bài</th>
                <th className="px-4 py-2 font-medium">Vi phạm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r) => (
                <tr key={r.student_code_id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-slate-900">{r.code}</td>
                  <td className="px-4 py-2 text-slate-700">{r.student_name || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {STATUS_LABEL[r.session_status ?? r.status] ?? r.session_status ?? r.status}
                  </td>
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {r.total_score !== null ? (
                      r.session_id ? (
                        <Link
                          href={`/admin/exams/${examId}/results/${r.session_id}`}
                          className="hover:underline"
                        >
                          {r.total_score.toFixed(2)}
                        </Link>
                      ) : (
                        r.total_score.toFixed(2)
                      )
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.duration_seconds !== null
                      ? `${Math.round(r.duration_seconds / 60)} phút`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {r.violation_count > 0 ? (
                      <span className="text-red-600 font-medium">{r.violation_count}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
