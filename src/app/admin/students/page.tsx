"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Skeleton } from "@/components/ui/skeleton";

type Student = {
  id: string;
  code: string;
  full_name: string | null;
  created_at: string;
  exam_count: number;
};

export default function StudentsPage() {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Debounce từ khóa tìm kiếm rồi để cache hook tự fetch theo URL.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, reload, isLoading: loading } = useCachedFetch<{ students: Student[] }>(
    debouncedQ
      ? `/api/admin/students?q=${encodeURIComponent(debouncedQ)}`
      : "/api/admin/students"
  );
  const students = data?.students ?? [];
  const load = useCallback(async (_query?: string) => reload(), [reload]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newCode.trim() || undefined,
          full_name: newName.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNewCode("");
      setNewName("");
      setShowCreate(false);
      await load(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(id: string, currentName: string | null) {
    const name = prompt("Tên thí sinh:", currentName ?? "");
    if (name === null) return;
    const res = await fetch(`/api/admin/students/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name.trim() || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    await load(q);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Quản lý thí sinh</h1>
          <p className="text-sm text-slate-500">
            Danh sách toàn bộ thí sinh trong hệ thống (dùng chung 1 mã cho nhiều đề). Tạo thí
            sinh ở đây rồi vào từng đề thi để gán, thay vì phải sinh mã mới mỗi lần.
          </p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 shrink-0"
        >
          + Thêm thí sinh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="space-y-3 bg-white border border-slate-200 rounded-lg p-4 max-w-lg"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">
                Mã số (để trống sẽ tự sinh)
              </label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="VD: SBD001"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Tên thí sinh</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nguyễn Văn A"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {creating ? "Đang tạo..." : "Tạo thí sinh"}
          </button>
        </form>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm theo mã số hoặc tên..."
        className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full animate-shimmer" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có thí sinh nào.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Mã số</th>
                <th className="px-4 py-2 font-medium">Tên</th>
                <th className="px-4 py-2 font-medium">Số đề đã gán</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2 font-mono">
                    <Link href={`/admin/students/${s.id}`} className="text-primary hover:underline">
                      {s.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {s.full_name || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{s.exam_count}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleRename(s.id, s.full_name)}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      Sửa tên
                    </button>
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
