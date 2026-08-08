"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ExamTabs } from "@/components/admin/ExamTabs";

type Row = {
  student_code_id: string;
  code: string;
  student_name: string | null;
  status: string;
  session_id: string | null;
  student_id?: string | null;
  session_status: string | null;
  total_score: number | null;
  violation_count: number;
  duration_seconds: number | null;
  invalidated?: boolean;
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
  const [sort, setSort] = useState<"score_desc" | "score_asc" | "duration_desc" | "duration_asc">(
    "score_desc"
  );

  async function load() {
    try {
      const r = await fetch(`/api/admin/exams/${examId}/results`);
      const json = await r.json();
      // API lỗi trả {error} không có rows — không được set undefined vào state.
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setSummary(json.summary ?? null);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  async function rescore() {
    if (
      !confirm(
        "Chấm lại TOÀN BỘ bài của đề này?\n\nĐáp án đúng trong đề của từng thí sinh sẽ được cập nhật theo ngân hàng câu hỏi HIỆN TẠI (dùng sau khi bạn đã sửa câu hỏi sai đáp án). Điểm sửa tay không bị ghi đè."
      )
    )
      return;
    const res = await fetch(`/api/admin/exams/${examId}/rescore`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    alert(`Đã chấm lại ${json.sessions_rescored} bài.`);
    load();
  }

  async function editScore(row: Row) {
    if (!row.session_id) return;
    const input = prompt(
      `Điểm mới cho ${row.code} (hiện tại: ${row.total_score ?? "—"}):`
    );
    if (input === null) return;
    const score = Number(input);
    if (Number.isNaN(score) || score < 0) {
      alert("Điểm không hợp lệ");
      return;
    }
    const reason = prompt("Lý do sửa điểm (bắt buộc, sẽ lưu audit):");
    if (!reason?.trim()) return;
    const res = await fetch(`/api/admin/sessions/${row.session_id}/ops`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_score", score, reason: reason.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    load();
  }

  const sorted = [...rows].sort((a, b) => {
    if (sort === "duration_desc" || sort === "duration_asc") {
      // Chưa có thời gian (chưa nộp) luôn xếp cuối bất kể chiều sort.
      const av = a.duration_seconds ?? -1;
      const bv = b.duration_seconds ?? -1;
      if (av === -1 && bv === -1) return 0;
      if (av === -1) return 1;
      if (bv === -1) return -1;
      return sort === "duration_desc" ? bv - av : av - bv;
    }
    const av = a.total_score ?? -1;
    const bv = b.total_score ?? -1;
    return sort === "score_desc" ? bv - av : av - bv;
  });

  return (
    <div className="space-y-6">
      <ExamTabs examId={examId} active="results" />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Kết quả & báo cáo</h1>
        <div className="flex items-center gap-2">
        <button
          onClick={rescore}
          className="rounded-md border border-amber-300 text-amber-700 text-sm px-4 py-2 hover:bg-amber-50"
          title="Dùng sau khi sửa đáp án câu hỏi sai trong ngân hàng"
        >
          Chấm lại toàn bộ
        </button>
        <a
          href={`/api/admin/exams/${examId}/results/export?format=csv`}
          className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Xuất CSV
        </a>
        </div>
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
                  onClick={() => setSort(sort === "score_desc" ? "score_asc" : "score_desc")}
                >
                  Điểm {sort === "score_desc" ? "↓" : sort === "score_asc" ? "↑" : ""}
                </th>
                <th
                  className="px-4 py-2 font-medium cursor-pointer select-none"
                  onClick={() => setSort(sort === "duration_desc" ? "duration_asc" : "duration_desc")}
                >
                  Thời gian làm bài {sort === "duration_desc" ? "↓" : sort === "duration_asc" ? "↑" : ""}
                </th>
                <th className="px-4 py-2 font-medium">Vi phạm</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((r) => (
                <tr
                  key={r.student_code_id}
                  className={`hover:bg-slate-50 ${r.invalidated ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-2 font-mono">
                    {r.student_id ? (
                      <Link
                        href={`/admin/students/${r.student_id}`}
                        className="text-primary hover:underline"
                      >
                        {r.code}
                      </Link>
                    ) : (
                      r.code
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{r.student_name || "—"}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.invalidated ? (
                      <span className="text-red-600 font-medium">Đã hủy kết quả</span>
                    ) : (
                      STATUS_LABEL[r.session_status ?? r.status] ?? r.session_status ?? r.status
                    )}
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
                  <td className="px-4 py-2 text-right">
                    {r.session_id && r.total_score !== null && (
                      <button
                        onClick={() => editScore(r)}
                        className="text-xs text-slate-400 hover:text-slate-700 underline"
                        title="Sửa điểm thủ công (ghi audit, ưu tiên hơn điểm máy chấm)"
                      >
                        Sửa điểm
                      </button>
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
