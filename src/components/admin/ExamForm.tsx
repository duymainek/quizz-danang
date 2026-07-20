"use client";

import { useEffect, useState } from "react";

type Subject = { id: string; name: string };
type Pool = { id: string; name: string; questions: { count: number }[] };

export type ExamFormValue = {
  subject_id: string;
  name: string;
  duration_minutes: number;
  max_violations: number;
  monitoring_enabled: boolean;
  scoring_mode: "uniform" | "per_question";
  scale: number;
  pool_configs: { pool_id: string; num_questions_to_draw: number }[];
};

export function ExamForm({
  initial,
  onSubmit,
  submitting,
  submitLabel = "Tạo đề thi",
}: {
  initial?: ExamFormValue;
  onSubmit: (value: ExamFormValue) => Promise<void> | void;
  submitting: boolean;
  submitLabel?: string;
}) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);
  const [subjectId, setSubjectId] = useState(initial?.subject_id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [maxViolations, setMaxViolations] = useState(initial?.max_violations ?? 3);
  const [monitoringEnabled, setMonitoringEnabled] = useState(
    initial?.monitoring_enabled ?? true
  );
  const [scoringMode, setScoringMode] = useState<"uniform" | "per_question">(
    initial?.scoring_mode ?? "uniform"
  );
  const [scale, setScale] = useState(initial?.scale ?? 10);
  const [draws, setDraws] = useState<Record<string, number>>(
    Object.fromEntries(
      (initial?.pool_configs ?? []).map((c) => [c.pool_id, c.num_questions_to_draw])
    )
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/subjects")
      .then((r) => r.json())
      .then((j) => setSubjects(j.subjects ?? []));
  }, []);

  useEffect(() => {
    if (!subjectId) {
      setPools([]);
      return;
    }
    fetch(`/api/admin/pools?subject_id=${subjectId}`)
      .then((r) => r.json())
      .then((j) => setPools(j.pools ?? []));
  }, [subjectId]);

  const totalQuestions = Object.values(draws).reduce((sum, n) => sum + (n || 0), 0);

  function setDraw(poolId: string, value: number | null) {
    setDraws((d) => {
      const next = { ...d };
      if (value === null) delete next[poolId];
      else next[poolId] = value;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subjectId) return setError("Vui lòng chọn môn thi");
    if (!name.trim()) return setError("Vui lòng nhập tên đề thi");
    const pool_configs = Object.entries(draws)
      .filter(([, n]) => n > 0)
      .map(([pool_id, num_questions_to_draw]) => ({ pool_id, num_questions_to_draw }));
    if (pool_configs.length === 0) {
      return setError("Cấu hình ít nhất 1 tệp câu hỏi với số câu rút > 0");
    }
    await onSubmit({
      subject_id: subjectId,
      name: name.trim(),
      duration_minutes: duration,
      max_violations: maxViolations,
      monitoring_enabled: monitoringEnabled,
      scoring_mode: scoringMode,
      scale,
      pool_configs,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-slate-200 rounded-lg p-5 max-w-2xl">
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Môn thi</label>
        <select
          value={subjectId}
          onChange={(e) => {
            setSubjectId(e.target.value);
            setDraws({});
          }}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">-- Chọn môn thi --</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Tên đề thi</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='VD: "Môn X — Đề chuẩn"'
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Thời lượng (phút)</label>
          <input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Số lần vi phạm cho phép</label>
          <input
            type="number"
            min={0}
            value={maxViolations}
            onChange={(e) => setMaxViolations(Number(e.target.value))}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            Nhập 0 nếu muốn vi phạm đầu tiên tự động nộp bài ngay.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={monitoringEnabled}
          onChange={(e) => setMonitoringEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        Bật chế độ giám sát màn hình (theo dõi chuyển tab, thoát fullscreen...)
      </label>

      <div className="space-y-2 border border-slate-200 rounded-lg p-4">
        <label className="text-sm font-medium text-slate-700">Cách chấm điểm</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="scoring_mode"
              checked={scoringMode === "uniform"}
              onChange={() => setScoringMode("uniform")}
              className="h-4 w-4 mt-0.5"
            />
            <span>
              Chia đều theo thang điểm — điểm = thang điểm × (số câu đúng / tổng số câu)
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="scoring_mode"
              checked={scoringMode === "per_question"}
              onChange={() => setScoringMode("per_question")}
              className="h-4 w-4 mt-0.5"
            />
            <span>
              Điểm riêng từng câu — tổng điểm = cộng điểm các câu làm đúng (điểm mỗi câu
              cấu hình khi tạo câu hỏi)
            </span>
          </label>
        </div>
        {scoringMode === "uniform" && (
          <div className="space-y-1 pt-1">
            <label className="text-sm text-slate-700">Thang điểm</label>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">Mặc định thang điểm 10.</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          Cấu hình rút câu theo tệp
        </label>
        {!subjectId ? (
          <p className="text-sm text-slate-400">Chọn môn thi để xem danh sách tệp câu hỏi.</p>
        ) : pools.length === 0 ? (
          <p className="text-sm text-slate-400">Môn này chưa có tệp câu hỏi nào.</p>
        ) : (
          <div className="space-y-2">
            {pools.map((p) => {
              const available = p.questions?.[0]?.count ?? 0;
              const checked = draws[p.id] !== undefined;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 border border-slate-200 rounded-md px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setDraw(p.id, e.target.checked ? Math.min(1, available) : null)
                    }
                    disabled={available === 0}
                    className="h-4 w-4"
                  />
                  <div className="flex-1">
                    <p className="text-sm text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-500">Có sẵn {available} câu</p>
                  </div>
                  {checked && (
                    <input
                      type="number"
                      min={1}
                      max={available}
                      value={draws[p.id]}
                      onChange={(e) =>
                        setDraw(p.id, Math.max(1, Math.min(available, Number(e.target.value))))
                      }
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm text-right"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="text-sm text-slate-700 font-medium">
          Tổng số câu của đề: {totalQuestions}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
      >
        {submitting ? "Đang lưu..." : submitLabel}
      </button>
    </form>
  );
}
