"use client";

import { useState } from "react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Skeleton } from "@/components/ui/skeleton";

type Term = {
  id: string;
  name: string;
  year: number;
  status: "draft" | "active" | "archived";
  created_at: string;
};

const STATUS_LABEL: Record<Term["status"], string> = {
  draft: "Nháp",
  active: "Đang hoạt động",
  archived: "Đã lưu trữ",
};

const STATUS_CLASS: Record<Term["status"], string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  archived: "bg-amber-100 text-amber-700",
};

export default function TermsPage() {
  const { data, reload } = useCachedFetch<{ terms: Term[]; current_term_id: string }>(
    "/api/admin/terms"
  );
  const terms = data?.terms ?? null;
  const currentId = data?.current_term_id ?? "";
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = reload;

  const createTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), year }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không tạo được khóa thi");
      setName("");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: Term["status"]) => {
    const res = await fetch(`/api/admin/terms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Khóa thi</h1>
      <p className="text-sm text-slate-600">
        Mỗi khóa thi có đề thi, thí sinh và kết quả riêng. Chọn khóa đang làm việc bằng
        dropdown trên thanh điều hướng.
      </p>

      <form onSubmit={createTerm} className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-lg p-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tên khóa thi</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="VD: Hội thi Đoàn 2027"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm w-64"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Năm</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm w-24"
          />
        </div>
        <button
          disabled={saving}
          className="bg-slate-900 text-white text-sm rounded-md px-4 py-2 hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Đang tạo…" : "Tạo khóa mới"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {terms === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Tên</th>
                <th className="px-4 py-2 font-medium">Năm</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {terms.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-900">
                    {t.name}
                    {t.id === currentId && (
                      <span className="ml-2 text-xs text-emerald-600">● đang chọn</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{t.year}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.status !== "archived" ? (
                      <button
                        onClick={() => setStatus(t.id, "archived")}
                        className="text-xs text-slate-500 hover:text-amber-700"
                      >
                        Lưu trữ
                      </button>
                    ) : (
                      <button
                        onClick={() => setStatus(t.id, "active")}
                        className="text-xs text-slate-500 hover:text-emerald-700"
                      >
                        Mở lại
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
