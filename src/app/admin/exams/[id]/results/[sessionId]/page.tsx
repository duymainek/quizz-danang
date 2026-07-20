"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

type DetailItem = {
  question_id: string;
  content: string;
  options: string[];
  correct_answers: number[];
  selected_options: number[];
  is_correct: boolean;
  points: number;
  earned_points: number;
};

type ResultData = {
  session: {
    started_at: string;
    submitted_at: string | null;
    status: string;
    violation_count: number;
    student_codes: { code: string; student_name: string | null };
    exams: { name: string; duration_minutes: number };
  };
  score: { total_score: number; detail: DetailItem[] } | null;
};

type SessionEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  client_time: string | null;
  created_at: string;
};

const EVENT_LABEL: Record<string, string> = {
  session_loaded: "Tải đề thi",
  answer_first_select: "Chọn đáp án lần đầu",
  answer_change: "Đổi đáp án",
  answer_save_failed: "Lưu đáp án thất bại (lỗi mạng)",
  answer_save_recovered: "Lưu đáp án thành công trở lại",
  submit_attempt: "Bắt đầu nộp bài",
  submit_success: "Nộp bài thành công",
  submit_error: "Nộp bài lỗi",
  network_offline: "Mất kết nối mạng",
  network_online: "Có kết nối mạng trở lại",
};

const EVENT_COLOR: Record<string, string> = {
  answer_save_failed: "border-red-300 bg-red-50",
  submit_error: "border-red-300 bg-red-50",
  network_offline: "border-amber-300 bg-amber-50",
  submit_success: "border-emerald-300 bg-emerald-50",
};

export default function SessionResultPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: examId, sessionId } = use(params);
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const [showEvents, setShowEvents] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/sessions/${sessionId}/result`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    if (!showEvents || events !== null) return;
    fetch(`/api/admin/sessions/${sessionId}/events`)
      .then((r) => r.json())
      .then((json) => setEvents(json.events ?? []));
  }, [showEvents, events, sessionId]);

  if (loading) return <p className="text-sm text-slate-500">Đang tải...</p>;
  if (!data) return null;

  const { session, score } = data;

  return (
    <div className="space-y-6">
      <Link href={`/admin/exams/${examId}/results`} className="text-sm text-slate-500 hover:underline">
        ← Danh sách kết quả
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 font-mono">
            {session.student_codes.code}
          </h1>
          <p className="text-sm text-slate-500">
            {session.student_codes.student_name || "Chưa gán tên"} · {session.exams.name}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-900">
            {score ? score.total_score.toFixed(2) : "—"}
            <span className="text-sm text-slate-400 font-normal"> / 10</span>
          </p>
          {session.violation_count > 0 && (
            <p className="text-xs text-red-600">{session.violation_count} lần vi phạm</p>
          )}
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg bg-white">
        <button
          onClick={() => setShowEvents((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700"
        >
          <span>Nhật ký thao tác (trace sự cố mạng, đổi đáp án...)</span>
          <span className="text-slate-400">{showEvents ? "Thu gọn ▲" : "Xem ▼"}</span>
        </button>
        {showEvents && (
          <div className="border-t border-slate-200 px-4 py-3">
            {events === null ? (
              <p className="text-sm text-slate-400">Đang tải...</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-slate-400">Chưa có log nào.</p>
            ) : (
              <ul className="space-y-2 max-h-96 overflow-y-auto">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className={`text-xs border-l-2 pl-3 py-1 rounded-r ${
                      EVENT_COLOR[ev.type] ?? "border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">
                        {EVENT_LABEL[ev.type] ?? ev.type}
                      </span>
                      <span className="text-slate-400 shrink-0">
                        {new Date(ev.created_at).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    {Object.keys(ev.payload ?? {}).length > 0 && (
                      <pre className="mt-1 text-[11px] text-slate-500 whitespace-pre-wrap break-all">
                        {JSON.stringify(ev.payload)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {!score ? (
        <p className="text-sm text-slate-500">Chưa có điểm cho lượt thi này.</p>
      ) : (
        <ul className="space-y-3">
          {score.detail.map((item, i) => (
            <li
              key={item.question_id}
              className={`bg-white border rounded-lg p-4 ${
                item.is_correct ? "border-emerald-200" : "border-red-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">
                  Câu {i + 1}. {item.content}
                </p>
                <span
                  className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                    item.is_correct
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {item.is_correct ? "Đúng" : "Sai"}
                  {item.points !== 1 ? ` (${item.earned_points}/${item.points} điểm)` : ""}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {item.options.map((opt, idx) => {
                  const isCorrectOpt = item.correct_answers.includes(idx);
                  const isSelectedOpt = item.selected_options.includes(idx);
                  return (
                    <li
                      key={idx}
                      className={`text-sm px-2 py-1 rounded ${
                        isCorrectOpt
                          ? "bg-emerald-50 text-emerald-800"
                          : isSelectedOpt
                            ? "bg-red-50 text-red-800"
                            : "text-slate-600"
                      }`}
                    >
                      {String.fromCharCode(65 + idx)}. {opt}
                      {isCorrectOpt ? " ✓ (đáp án đúng)" : ""}
                      {isSelectedOpt && !isCorrectOpt ? " ← thí sinh chọn" : ""}
                      {isSelectedOpt && isCorrectOpt ? " ← thí sinh chọn" : ""}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
