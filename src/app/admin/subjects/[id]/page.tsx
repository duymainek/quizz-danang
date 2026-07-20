"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type Pool = {
  id: string;
  name: string;
  questions: { count: number }[];
};

export default function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subjectId } = use(params);
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pools?subject_id=${subjectId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPools(json.pools);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject_id: subjectId, name }),
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
    if (!confirm("Xóa tệp câu hỏi này? Toàn bộ câu hỏi trong tệp sẽ bị xóa.")) return;
    const res = await fetch(`/api/admin/pools/${id}`, { method: "DELETE" });
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
        <Link href="/admin/subjects" className="text-sm text-slate-500 hover:underline">
          ← Danh sách môn thi
        </Link>
        <h1 className="text-xl font-semibold text-slate-900 mt-1">Tệp câu hỏi</h1>
        <p className="text-sm text-slate-500">
          Mỗi tệp là 1 nhóm câu hỏi để rút ngẫu nhiên khi cấu hình đề thi.
        </p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2 max-w-md">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên tệp mới, VD: Tệp 1"
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
      ) : pools.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có tệp câu hỏi nào.</p>
      ) : (
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white">
          {pools.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  href={`/admin/pools/${p.id}`}
                  className="font-medium text-slate-900 hover:underline"
                >
                  {p.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {p.questions?.[0]?.count ?? 0} câu hỏi
                </p>
              </div>
              <button
                onClick={() => handleDelete(p.id)}
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
