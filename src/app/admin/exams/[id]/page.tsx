"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExamForm, type ExamFormValue } from "@/components/admin/ExamForm";

type ExamDetail = ExamFormValue & {
  id: string;
  is_active: boolean;
  student_codes_count: number;
  used_codes_count: number;
  exam_pool_configs: {
    pool_id: string;
    num_questions_to_draw: number;
    question_pools: { name: string; questions: { count: number }[] };
  }[];
};

export default function ExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setExam(json.exam);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpdate(value: ExamFormValue) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Xóa đề thi này?")) return;
    const res = await fetch(`/api/admin/exams/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    router.push("/admin/exams");
  }

  async function handleToggleActive() {
    if (!exam) return;
    const nextValue = !exam.is_active;
    if (
      nextValue &&
      !confirm(
        "Mở đề thi này? Thí sinh sẽ thấy đề ở trang chọn đề và có thể bắt đầu vào thi ngay."
      )
    )
      return;
    if (
      !nextValue &&
      !confirm("Đóng đề thi này? Thí sinh chưa bắt đầu sẽ không thể vào thi nữa (người đang thi dở vẫn tiếp tục bình thường).")
    )
      return;
    setTogglingActive(true);
    try {
      const res = await fetch(`/api/admin/exams/${id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextValue }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setTogglingActive(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Đang tải...</p>;
  if (error && !exam)
    return (
      <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        {error}
      </p>
    );
  if (!exam) return null;

  const editLocked = exam.used_codes_count > 0;
  const deleteLocked = exam.student_codes_count > 0;

  if (editing) {
    return (
      <div className="space-y-4">
        <Link href={`/admin/exams/${id}`} className="text-sm text-slate-500 hover:underline">
          ← Quay lại
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Sửa đề thi</h1>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 max-w-2xl">
            {error}
          </p>
        )}
        <ExamForm
          initial={{
            name: exam.name,
            duration_minutes: exam.duration_minutes,
            max_violations: exam.max_violations,
            monitoring_enabled: exam.monitoring_enabled,
            scoring_mode: exam.scoring_mode,
            scale: exam.scale,
            publish_score: exam.publish_score,
            pool_configs: exam.exam_pool_configs.map((c) => ({
              pool_id: c.pool_id,
              num_questions_to_draw: c.num_questions_to_draw,
            })),
          }}
          onSubmit={handleUpdate}
          submitting={submitting}
          submitLabel="Lưu thay đổi"
        />
      </div>
    );
  }

  const totalQuestions = exam.exam_pool_configs.reduce(
    (sum, c) => sum + c.num_questions_to_draw,
    0
  );

  return (
    <div className="space-y-6">
      <Link href="/admin/exams" className="text-sm text-slate-500 hover:underline">
        ← Danh sách đề thi
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">{exam.name}</h1>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                exam.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {exam.is_active ? "Đang mở cho thí sinh" : "Chưa mở"}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleToggleActive}
            disabled={togglingActive}
            className={`rounded-md text-sm px-4 py-2 font-medium disabled:opacity-50 ${
              exam.is_active
                ? "border border-amber-300 text-amber-700 hover:bg-amber-50"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
            }`}
          >
            {togglingActive ? "Đang lưu..." : exam.is_active ? "Đóng đề thi" : "Mở đề thi"}
          </button>
          <Link
            href={`/admin/exams/${id}/dashboard`}
            className="rounded-md bg-blue-600 text-white text-sm px-4 py-2 hover:bg-blue-500"
          >
            Giám sát real-time
          </Link>
          <Link
            href={`/admin/exams/${id}/codes`}
            className="rounded-md bg-slate-900 text-white text-sm px-4 py-2 hover:bg-slate-800"
          >
            Mã số thí sinh
          </Link>
          <Link
            href={`/admin/exams/${id}/results`}
            className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            Kết quả
          </Link>
          {!editLocked && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Sửa
            </button>
          )}
          {!deleteLocked && (
            <button
              onClick={handleDelete}
              className="rounded-md border border-red-300 text-red-600 text-sm px-4 py-2 hover:bg-red-50"
            >
              Xóa
            </button>
          )}
        </div>
      </div>

      {editLocked ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          Đề thi này đã có {exam.used_codes_count} mã số được thí sinh dùng để thi (đang thi/đã
          nộp) nên không thể sửa để đảm bảo tính công bằng — tạo đề mới nếu cần thay đổi cấu hình.
        </p>
      ) : (
        deleteLocked && (
          <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            Đề thi đã có {exam.student_codes_count} mã số được sinh ra (chưa ai dùng) — vẫn sửa
            được, nhưng muốn xóa hẳn đề thì cần xóa các mã số đó trước.
          </p>
        )
      )}

      <dl className="grid grid-cols-2 gap-4 max-w-xl text-sm">
        <div>
          <dt className="text-slate-500">Thời lượng</dt>
          <dd className="text-slate-900 font-medium">{exam.duration_minutes} phút</dd>
        </div>
        <div>
          <dt className="text-slate-500">Tổng số câu</dt>
          <dd className="text-slate-900 font-medium">{totalQuestions} câu</dd>
        </div>
        <div>
          <dt className="text-slate-500">Số lần vi phạm cho phép</dt>
          <dd className="text-slate-900 font-medium">{exam.max_violations}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Giám sát màn hình</dt>
          <dd className="text-slate-900 font-medium">
            {exam.monitoring_enabled ? "Bật" : "Tắt"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Cách chấm điểm</dt>
          <dd className="text-slate-900 font-medium">
            {exam.scoring_mode === "per_question"
              ? "Điểm riêng từng câu"
              : `Chia đều thang điểm ${exam.scale}`}
          </dd>
        </div>
      </dl>

      <div>
        <h2 className="text-sm font-medium text-slate-700 mb-2">Cấu hình rút câu theo tệp</h2>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg bg-white max-w-xl">
          {exam.exam_pool_configs.map((c) => (
            <li key={c.pool_id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-slate-800">{c.question_pools?.name}</span>
              <span className="text-slate-500">
                Rút {c.num_questions_to_draw} / {c.question_pools?.questions?.[0]?.count ?? 0} câu
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
