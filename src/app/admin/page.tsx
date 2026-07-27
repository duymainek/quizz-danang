"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Overview = {
  total_exams: number;
  active_exams: number;
  in_progress_sessions: number;
  submitted_today: number;
  violations_today: number;
  active_exams_summary: {
    id: string;
    name: string;
    duration_minutes: number;
    total: number;
    in_progress: number;
    submitted: number;
    unused: number;
  }[];
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "blue" | "emerald";
}) {
  const accentClass =
    accent === "amber"
      ? "text-amber-600"
      : accent === "blue"
        ? "text-blue-600"
        : accent === "emerald"
          ? "text-emerald-600"
          : "text-slate-900";
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${accentClass}`}>{value}</p>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/overview");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Tự làm mới mỗi 15s để phản ánh tình hình real-time khi có nhiều đề
    // diễn ra song song, không cần bấm F5.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (loading && !data) return <p className="text-sm text-slate-500">Đang tải...</p>;
  if (error && !data)
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {error}
      </p>
    );
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Tổng quan</h1>
        <p className="text-sm text-slate-500">
          Số liệu tổng hợp toàn hệ thống, tự làm mới mỗi 15 giây.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Đề đang mở" value={data.active_exams} />
        <StatCard label="Tổng số đề" value={data.total_exams} />
        <StatCard label="Đang thi (real-time)" value={data.in_progress_sessions} accent="blue" />
        <StatCard label="Đã nộp hôm nay" value={data.submitted_today} accent="emerald" />
        <StatCard label="Vi phạm hôm nay" value={data.violations_today} accent="amber" />
      </div>

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">Đề đang mở cho thí sinh</h2>
        {data.active_exams_summary.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-lg p-4">
            Hiện chưa có đề nào đang mở.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
            {data.active_exams_summary.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link
                    href={`/admin/exams/${e.id}/dashboard`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {e.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {e.duration_minutes} phút · {e.total} mã số
                  </p>
                </div>
                <div className="flex gap-4 text-sm text-right">
                  <div>
                    <p className="text-slate-400 text-xs">Chưa thi</p>
                    <p className="text-slate-700 font-medium">{e.unused}</p>
                  </div>
                  <div>
                    <p className="text-blue-400 text-xs">Đang thi</p>
                    <p className="text-blue-700 font-medium">{e.in_progress}</p>
                  </div>
                  <div>
                    <p className="text-emerald-400 text-xs">Đã nộp</p>
                    <p className="text-emerald-700 font-medium">{e.submitted}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
