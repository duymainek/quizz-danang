"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";

type Row = {
  student_code_id: string;
  code: string;
  student_name: string | null;
  status: "unused" | "in_progress" | "submitted" | "reset";
  session_id: string | null;
  violation_count: number;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
};

type Violation = { id: string; type: string; created_at: string };

const STATUS_LABEL: Record<Row["status"], string> = {
  unused: "Chưa bắt đầu",
  in_progress: "Đang thi",
  submitted: "Đã nộp",
  reset: "Đã reset",
};

const STATUS_COLOR: Record<Row["status"], string> = {
  unused: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-100 text-blue-700",
  submitted: "bg-emerald-100 text-emerald-700",
  reset: "bg-amber-100 text-amber-700",
};

const VIOLATION_LABEL: Record<string, string> = {
  tab_hidden: "Chuyển tab / rời màn hình",
  window_blur: "Rời cửa sổ làm bài",
  fullscreen_exit: "Thoát toàn màn hình",
  copy_paste: "Copy/Paste",
  beforeunload: "Cố đóng/tải lại trang",
};

function RemainingTime({ deadlineAt, status }: { deadlineAt: string | null; status: Row["status"] }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (status !== "in_progress" || !deadlineAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [status, deadlineAt]);

  if (status !== "in_progress" || !deadlineAt) return <span className="text-slate-400">—</span>;
  const remainingMs = new Date(deadlineAt).getTime() - Date.now();
  if (remainingMs <= 0) return <span className="text-slate-400">Hết giờ</span>;
  const m = Math.floor(remainingMs / 60000);
  const s = Math.floor((remainingMs % 60000) / 1000);
  return (
    <span className={remainingMs < 5 * 60_000 ? "text-amber-600 font-medium" : "text-slate-700"}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export default function ExamDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | Row["status"]>("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/exams/${examId}/sessions`);
    const json = await res.json();
    if (res.ok) setRows(json.rows);
    setLoading(false);
  }, [examId]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) return;
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null;
      load();
    }, 800);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`exam-dashboard-${examId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_sessions", filter: `exam_id=eq.${examId}` },
        () => scheduleRefetch()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "student_codes", filter: `exam_id=eq.${examId}` },
        () => scheduleRefetch()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [examId, scheduleRefetch]);

  // Highlight nhẹ dòng vừa cập nhật (so sánh violation_count/status thay đổi).
  const prevRowsRef = useRef<Map<string, Row>>(new Map());
  useEffect(() => {
    const changed = new Set<string>();
    for (const r of rows) {
      const prev = prevRowsRef.current.get(r.student_code_id);
      if (prev && (prev.status !== r.status || prev.violation_count !== r.violation_count)) {
        changed.add(r.student_code_id);
      }
    }
    if (changed.size > 0) {
      setHighlighted(changed);
      setTimeout(() => setHighlighted(new Set()), 1500);
    }
    prevRowsRef.current = new Map(rows.map((r) => [r.student_code_id, r]));
  }, [rows]);

  async function openDetail(row: Row) {
    setSelected(row);
    if (!row.session_id) {
      setViolations([]);
      return;
    }
    const res = await fetch(`/api/admin/sessions/${row.session_id}/violations`);
    const json = await res.json();
    if (res.ok) setViolations(json.violations);
  }

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    acc.violated = (acc.violated ?? 0) + (r.violation_count > 0 ? 1 : 0);
    return acc;
  }, {});

  const filtered = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="space-y-6">
      <Link href={`/admin/exams/${examId}`} className="text-sm text-slate-500 hover:underline">
        ← Chi tiết đề thi
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Giám sát real-time</h1>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ["Tổng số mã", rows.length],
          ["Đang thi", counts.in_progress ?? 0],
          ["Đã nộp", counts.submitted ?? 0],
          ["Chưa bắt đầu", counts.unused ?? 0],
          ["Có vi phạm", counts.violated ?? 0],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-semibold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 text-sm">
        {(["all", "unused", "in_progress", "submitted", "reset"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 ${
              filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            {f === "all" ? "Tất cả" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

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
                <th className="px-4 py-2 font-medium">Còn lại</th>
                <th className="px-4 py-2 font-medium">Vi phạm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <tr
                  key={r.student_code_id}
                  onClick={() => openDetail(r)}
                  className={`cursor-pointer transition-colors duration-1000 ${
                    highlighted.has(r.student_code_id) ? "bg-amber-50" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-4 py-2 font-mono text-slate-900">{r.code}</td>
                  <td className="px-4 py-2 text-slate-700">{r.student_name || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <RemainingTime deadlineAt={r.deadline_at} status={r.status} />
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

      {selected && (
        <div
          className="fixed inset-0 bg-black/30 z-30 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-sm bg-white h-full p-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-mono text-lg text-slate-900">{selected.code}</p>
                <p className="text-sm text-slate-500">{selected.student_name || "Chưa gán tên"}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-500">
                Đóng
              </button>
            </div>

            {(selected.status === "in_progress" || selected.status === "submitted") && (
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      "Reset lượt thi này? Thí sinh sẽ thi lại từ đầu với đề random mới. Chỉ dùng khi có sự cố khách quan."
                    )
                  )
                    return;
                  const res = await fetch(
                    `/api/admin/student-codes/${selected.student_code_id}/reset`,
                    { method: "POST" }
                  );
                  const json = await res.json();
                  if (!res.ok) {
                    alert(json.error);
                    return;
                  }
                  setSelected(null);
                  load();
                }}
                className="mb-4 w-full rounded-md border border-amber-300 text-amber-700 text-sm py-2 hover:bg-amber-50"
              >
                Reset lượt thi
              </button>
            )}

            <h3 className="text-sm font-medium text-slate-700 mb-2">Log vi phạm</h3>
            {violations.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có vi phạm nào.</p>
            ) : (
              <ul className="space-y-2">
                {violations.map((v) => (
                  <li key={v.id} className="text-sm border-l-2 border-red-300 pl-3">
                    <p className="text-slate-800">{VIOLATION_LABEL[v.type] ?? v.type}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(v.created_at).toLocaleString("vi-VN")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
