"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ExamForm, type ExamFormValue } from "@/components/admin/ExamForm";

export default function NewExamPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(value: ExamFormValue) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      router.push(`/admin/exams/${json.exam.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/exams" className="text-sm text-slate-500 hover:underline">
        ← Danh sách đề thi
      </Link>
      <h1 className="text-xl font-semibold text-slate-900">Tạo đề thi mới</h1>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-2xl">
          {error}
        </p>
      )}
      <ExamForm onSubmit={handleSubmit} submitting={submitting} submitLabel="Tạo đề thi" />
    </div>
  );
}
