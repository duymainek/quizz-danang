"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { QuestionForm, type QuestionFormValue } from "@/components/admin/QuestionForm";
import { QuestionPreview } from "@/components/admin/QuestionPreview";

type Question = QuestionFormValue & { id: string };

export default function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: poolId } = use(params);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Question | null>(null);
  const [preview, setPreview] = useState<Question | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/questions?pool_id=${poolId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setQuestions(json.questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolId]);

  async function handleCreate(value: QuestionFormValue) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...value, pool_id: poolId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMode("list");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(value: QuestionFormValue) {
    if (!editing) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/questions/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMode("list");
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Xóa câu hỏi này?")) return;
    const res = await fetch(`/api/admin/questions/${id}`, { method: "DELETE" });
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
        <Link href="/admin/pools" className="text-sm text-slate-500 hover:underline">
          ← Danh sách tệp câu hỏi
        </Link>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-xl font-semibold text-slate-900">Câu hỏi trong tệp</h1>
          {mode === "list" && (
            <button
              onClick={() => setMode("create")}
              className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
            >
              + Thêm câu hỏi
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {mode === "create" && (
        <QuestionForm
          onSubmit={handleCreate}
          onCancel={() => setMode("list")}
          submitting={submitting}
        />
      )}

      {mode === "edit" && editing && (
        <QuestionForm
          initial={editing}
          onSubmit={handleUpdate}
          onCancel={() => {
            setMode("list");
            setEditing(null);
          }}
          submitting={submitting}
        />
      )}

      {mode === "list" &&
        (loading ? (
          <p className="text-sm text-slate-500">Đang tải...</p>
        ) : questions.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có câu hỏi nào trong tệp này.</p>
        ) : (
          <ul className="space-y-3">
            {questions.map((q, i) => (
              <li
                key={q.id}
                className="bg-white border border-slate-200 rounded-lg p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <p className="text-xs text-slate-400">
                    Câu {i + 1} · {q.type === "single" ? "1 đáp án đúng" : "Nhiều đáp án đúng"} · {q.points} điểm
                  </p>
                  <p className="text-sm text-slate-900 font-medium mt-1">{q.content}</p>
                  <ul className="mt-2 space-y-1">
                    {q.options.map((opt, idx) => (
                      <li
                        key={idx}
                        className={`text-sm ${
                          q.correct_answers.includes(idx)
                            ? "text-emerald-700 font-medium"
                            : "text-slate-600"
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}. {opt}
                        {q.correct_answers.includes(idx) ? " ✓" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setPreview(q)}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => {
                      setEditing(q);
                      setMode("edit");
                    }}
                    className="text-xs text-slate-600 hover:underline"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ))}

      {preview && (
        <QuestionPreview question={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
