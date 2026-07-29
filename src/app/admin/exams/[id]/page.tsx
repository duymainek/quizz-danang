"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExamTabs } from "@/components/admin/ExamTabs";
import { ExamForm, type ExamFormValue } from "@/components/admin/ExamForm";
import {
  Clock,
  ListChecks,
  ShieldAlert,
  Monitor,
  Calculator,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Play,
  Pause,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

  if (loading)
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64 animate-shimmer" />
        <Skeleton className="h-40 w-full animate-shimmer" />
      </div>
    );
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
      <Link href="/admin/exams" className="text-sm text-muted-foreground hover:underline">
        ← Danh sách đề thi
      </Link>
      <ExamTabs examId={id} active="config" />

      {/* Header: tên đề + trạng thái + hành động chính (điều hướng đã có tabs) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold truncate">{exam.name}</h1>
          <Badge variant={exam.is_active ? "default" : "secondary"}>
            {exam.is_active ? "Đang mở" : "Chưa mở"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleToggleActive}
            disabled={togglingActive}
            variant={exam.is_active ? "outline" : "default"}
          >
            {exam.is_active ? (
              <>
                <Pause className="h-4 w-4" /> Đóng đề thi
              </>
            ) : (
              <>
                <Play className="h-4 w-4" /> Mở đề thi
              </>
            )}
          </Button>
          {!editLocked && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Sửa
            </Button>
          )}
          {!deleteLocked && (
            <Button
              variant="outline"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Xóa
            </Button>
          )}
        </div>
      </div>

      {editLocked ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            Đã có {exam.used_codes_count} thí sinh dùng đề này (đang thi/đã nộp) nên không
            thể sửa cấu hình để đảm bảo công bằng. Tạo đề mới (hoặc dùng &quot;Nhân
            bản&quot;) nếu cần thay đổi.
          </p>
        </div>
      ) : (
        deleteLocked && (
          <div className="rounded-lg border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Đề đã có {exam.student_codes_count} mã số được sinh (chưa ai dùng) — vẫn sửa
            được, nhưng muốn xóa hẳn đề thì cần xóa các mã số đó trước.
          </div>
        )
      )}

      {/* Thông số dạng stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Clock, label: "Thời lượng", value: `${exam.duration_minutes} phút` },
          { icon: ListChecks, label: "Tổng số câu", value: `${totalQuestions} câu` },
          {
            icon: ShieldAlert,
            label: "Vi phạm cho phép",
            value: String(exam.max_violations),
          },
          {
            icon: Monitor,
            label: "Giám sát màn hình",
            value: exam.monitoring_enabled ? "Bật" : "Tắt",
          },
          {
            icon: Calculator,
            label: "Cách chấm",
            value:
              exam.scoring_mode === "per_question"
                ? "Điểm từng câu"
                : `Chia đều / ${exam.scale}`,
          },
          {
            icon: exam.publish_score ? Eye : EyeOff,
            label: "Công bố điểm",
            value: exam.publish_score ? "Có" : "Không",
          },
        ].map((item) => (
          <Card key={item.label} className="py-4">
            <CardContent className="px-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <item.icon className="h-3.5 w-3.5" />
                <span className="text-xs">{item.label}</span>
              </div>
              <p className="mt-1 text-base font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cấu hình rút câu theo tệp</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {exam.exam_pool_configs.map((c) => {
              const available = c.question_pools?.questions?.[0]?.count ?? 0;
              const pct = available > 0 ? (c.num_questions_to_draw / available) * 100 : 0;
              return (
                <li key={c.pool_id} className="flex items-center gap-4 py-3 text-sm">
                  <span className="flex-1 min-w-0 truncate font-medium">
                    {c.question_pools?.name}
                  </span>
                  <div className="hidden sm:block w-40 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    Rút {c.num_questions_to_draw} / {available} câu
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
