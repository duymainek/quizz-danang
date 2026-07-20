"use client";

import { useState } from "react";

export type QuestionFormValue = {
  content: string;
  type: "single" | "multi";
  options: string[];
  correct_answers: number[];
  points: number;
};

const emptyValue = (): QuestionFormValue => ({
  content: "",
  type: "single",
  options: ["", ""],
  correct_answers: [],
  points: 1,
});

export function QuestionForm({
  initial,
  onSubmit,
  onCancel,
  submitting,
}: {
  initial?: QuestionFormValue;
  onSubmit: (value: QuestionFormValue) => Promise<void> | void;
  onCancel: () => void;
  submitting: boolean;
}) {
  const [value, setValue] = useState<QuestionFormValue>(initial ?? emptyValue());
  const [error, setError] = useState<string | null>(null);

  function updateOption(idx: number, text: string) {
    setValue((v) => {
      const options = [...v.options];
      options[idx] = text;
      return { ...v, options };
    });
  }

  function addOption() {
    setValue((v) => ({ ...v, options: [...v.options, ""] }));
  }

  function removeOption(idx: number) {
    setValue((v) => ({
      ...v,
      options: v.options.filter((_, i) => i !== idx),
      correct_answers: v.correct_answers
        .filter((i) => i !== idx)
        .map((i) => (i > idx ? i - 1 : i)),
    }));
  }

  function toggleCorrect(idx: number) {
    setValue((v) => {
      if (v.type === "single") {
        return { ...v, correct_answers: [idx] };
      }
      const has = v.correct_answers.includes(idx);
      return {
        ...v,
        correct_answers: has
          ? v.correct_answers.filter((i) => i !== idx)
          : [...v.correct_answers, idx].sort(),
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (value.options.some((o) => !o.trim())) {
      setError("Các lựa chọn không được để trống");
      return;
    }
    if (value.correct_answers.length === 0) {
      setError("Phải chọn ít nhất 1 đáp án đúng");
      return;
    }
    await onSubmit(value);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-slate-200 rounded-lg p-4">
      <div className="space-y-1">
        <label className="text-sm font-medium text-slate-700">Nội dung câu hỏi</label>
        <textarea
          value={value.content}
          onChange={(e) => setValue((v) => ({ ...v, content: e.target.value }))}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">Loại câu hỏi</label>
          <select
            value={value.type}
            onChange={(e) =>
              setValue((v) => ({
                ...v,
                type: e.target.value as "single" | "multi",
                correct_answers: [],
              }))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="single">1 đáp án đúng</option>
            <option value="multi">Nhiều đáp án đúng (all-or-nothing)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-slate-700">
            Điểm câu hỏi
          </label>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={value.points}
            onChange={(e) =>
              setValue((v) => ({ ...v, points: Number(e.target.value) }))
            }
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="text-xs text-slate-500">
            Chỉ áp dụng nếu đề thi chọn chế độ chấm &quot;điểm theo từng câu&quot;.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          Lựa chọn (tick vào ô để đánh dấu đáp án đúng)
        </label>
        {value.options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type={value.type === "single" ? "radio" : "checkbox"}
              name="correct"
              checked={value.correct_answers.includes(idx)}
              onChange={() => toggleCorrect(idx)}
              className="h-4 w-4"
            />
            <input
              value={opt}
              onChange={(e) => updateOption(idx, e.target.value)}
              placeholder={`Lựa chọn ${idx + 1}`}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            {value.options.length > 2 && (
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="text-xs text-red-600 hover:underline"
              >
                Xóa
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addOption}
          className="text-xs text-slate-600 hover:underline"
        >
          + Thêm lựa chọn
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          {submitting ? "Đang lưu..." : "Lưu câu hỏi"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
      </div>
    </form>
  );
}
