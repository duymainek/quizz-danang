"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Subject = {
  id: string;
  name: string;
  created_at: string;
  question_pools: { count: number }[];
};

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subjects");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubjects(json.subjects);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/subjects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xóa môn thi này? Không thể hoàn tác.")) return;
    const res = await fetch(`/api/admin/subjects/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Môn thi</h1>
        <p className="text-sm text-slate-500">
          Mỗi môn có ngân hàng câu hỏi riêng, tổ chức theo các tệp câu hỏi.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên môn thi mới, VD: Kiến thức chung"
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          disabled={submitting}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          Thêm
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : subjects.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có môn thi nào.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {subjects.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  href={`/admin/subjects/${s.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {s.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {s.question_pools?.[0]?.count ?? 0} tệp câu hỏi
                </p>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                className="text-sm text-red-600 hover:underline"
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
