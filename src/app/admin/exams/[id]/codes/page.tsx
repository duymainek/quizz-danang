"use client";

import { useEffect, useState, use } from "react";

import { ExamTabs } from "@/components/admin/ExamTabs";
import { useCallback } from "react";

type StudentCode = {
  id: string;
  code: string;
  student_name: string | null;
  status: "unused" | "in_progress" | "submitted" | "reset";
  created_at: string;
};

const STATUS_LABEL: Record<StudentCode["status"], string> = {
  unused: "Chưa dùng",
  in_progress: "Đang thi",
  submitted: "Đã nộp",
  reset: "Đã reset",
};

const STATUS_COLOR: Record<StudentCode["status"], string> = {
  unused: "bg-slate-100 text-slate-700",
  in_progress: "bg-blue-100 text-blue-700",
  submitted: "bg-emerald-100 text-emerald-700",
  reset: "bg-amber-100 text-amber-700",
};

export default function StudentCodesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const [codes, setCodes] = useState<StudentCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(150);
  const [namesText, setNamesText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignResults, setAssignResults] = useState<
    { id: string; code: string; full_name: string | null }[]
  >([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [pasteCodesText, setPasteCodesText] = useState("");
  const [pasteLookupLoading, setPasteLookupLoading] = useState(false);
  const [pasteLookupNotice, setPasteLookupNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/student-codes`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCodes(json.student_codes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const searchStudents = useCallback(async (query: string) => {
    const url = query
      ? `/api/admin/students?q=${encodeURIComponent(query)}`
      : "/api/admin/students";
    const res = await fetch(url);
    const json = await res.json();
    if (res.ok) setAssignResults(json.students);
  }, []);

  useEffect(() => {
    if (!showAssignForm) return;
    const t = setTimeout(() => searchStudents(assignQuery), 250);
    return () => clearTimeout(t);
  }, [assignQuery, showAssignForm, searchStudents]);

  function toggleSelected(id: string) {
    setSelectedStudentIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected =
    assignResults.length > 0 && assignResults.every((s) => selectedStudentIds.has(s.id));

  function toggleSelectAllVisible() {
    setSelectedStudentIds((s) => {
      const next = new Set(s);
      if (allVisibleSelected) {
        for (const r of assignResults) next.delete(r.id);
      } else {
        for (const r of assignResults) next.add(r.id);
      }
      return next;
    });
  }

  async function handlePasteLookup() {
    const codes = pasteCodesText
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (codes.length === 0) return;
    setPasteLookupLoading(true);
    setPasteLookupNotice(null);
    try {
      const res = await fetch(`/api/admin/students?codes=${encodeURIComponent(codes.join(","))}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const found = json.students as { id: string; code: string }[];
      setSelectedStudentIds((s) => {
        const next = new Set(s);
        for (const f of found) next.add(f.id);
        return next;
      });
      const foundCodes = new Set(found.map((f) => f.code));
      const notFound = codes
        .map((c) => c.toUpperCase())
        .filter((c) => !foundCodes.has(c));
      setPasteLookupNotice(
        notFound.length === 0
          ? `Đã thêm ${found.length} mã vào danh sách chọn.`
          : `Đã thêm ${found.length} mã. Không tìm thấy ${notFound.length} mã: ${notFound.join(", ")}`
      );
    } catch (e) {
      setPasteLookupNotice(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setPasteLookupLoading(false);
    }
  }

  async function handleAssignExisting() {
    if (selectedStudentIds.size === 0) return;
    setAssigning(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${examId}/assign-students`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_ids: Array.from(selectedStudentIds) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSelectedStudentIds(new Set());
      setShowAssignForm(false);
      setPasteCodesText("");
      setPasteLookupNotice(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setAssigning(false);
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const names = namesText
        .split("\n")
        .map((n) => n.trim())
        .filter((n) => n.length > 0);
      const res = await fetch(`/api/admin/exams/${examId}/student-codes/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          names: names.length > 0 ? names : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setShowGenerateForm(false);
      setNamesText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(id: string) {
    if (
      !confirm(
        "Reset lượt thi này? Mã số sẽ quay về trạng thái 'chưa dùng' và thí sinh có thể thi lại từ đầu với đề random mới. Chỉ dùng khi có sự cố khách quan (rớt mạng...)."
      )
    )
      return;
    const res = await fetch(`/api/admin/student-codes/${id}/reset`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    await load();
  }

  async function handleRenameInline(id: string, currentName: string | null) {
    const name = prompt("Tên thí sinh:", currentName ?? "");
    if (name === null) return;
    const res = await fetch(`/api/admin/student-codes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_name: name.trim() || null }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json.error);
      return;
    }
    await load();
  }

  const statusCounts = codes.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <ExamTabs examId={examId} active="codes" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Mã số thí sinh</h1>
          <p className="text-sm text-slate-500">
            Tổng {codes.length} mã · {statusCounts.unused ?? 0} chưa dùng ·{" "}
            {statusCounts.in_progress ?? 0} đang thi · {statusCounts.submitted ?? 0} đã nộp
          </p>
        </div>
        <div className="flex gap-2">
          {codes.length > 0 && (
            <a
              href={`/api/admin/exams/${examId}/student-codes/export?format=csv`}
              className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
            >
              Xuất CSV
            </a>
          )}
          <button
            onClick={() => {
              setShowAssignForm((v) => !v);
              setShowGenerateForm(false);
            }}
            className="rounded-md border border-slate-300 text-sm px-4 py-2 text-slate-700 hover:bg-slate-50"
          >
            + Gán thí sinh có sẵn
          </button>
          <button
            onClick={() => {
              setShowGenerateForm((v) => !v);
              setShowAssignForm(false);
            }}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800"
          >
            + Sinh mã mới
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {showAssignForm && (
        <div className="space-y-3 bg-white border border-slate-200 rounded-lg p-4 max-w-lg">
          <p className="text-sm text-slate-500">
            Chọn thí sinh đã có sẵn trong hệ thống (VD đã thi đề khác) để gán vào đề này —
            dùng chung mã số, không tạo mã mới.
          </p>
          <input
            value={assignQuery}
            onChange={(e) => setAssignQuery(e.target.value)}
            placeholder="Tìm theo mã số hoặc tên..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          {assignResults.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAllVisible}
                className="h-4 w-4"
              />
              Chọn tất cả {assignResults.length} kết quả đang hiện
            </label>
          )}
          <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-md divide-y divide-slate-100">
            {assignResults.length === 0 ? (
              <p className="text-sm text-slate-400 px-3 py-4 text-center">
                Không tìm thấy thí sinh nào.
              </p>
            ) : (
              assignResults.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedStudentIds.has(s.id)}
                    onChange={() => toggleSelected(s.id)}
                    className="h-4 w-4"
                  />
                  <span className="font-mono text-slate-900">{s.code}</span>
                  <span className="text-slate-500">{s.full_name || "—"}</span>
                </label>
              ))
            )}
          </div>

          <details className="border-t border-slate-100 pt-3">
            <summary className="text-sm text-slate-600 cursor-pointer select-none">
              Hoặc dán 1 danh sách mã số (mỗi dòng 1 mã)
            </summary>
            <div className="mt-2 space-y-2">
              <textarea
                value={pasteCodesText}
                onChange={(e) => setPasteCodesText(e.target.value)}
                rows={4}
                placeholder={"TEST001\nTEST002\nTEST003\n..."}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                onClick={handlePasteLookup}
                disabled={pasteLookupLoading || !pasteCodesText.trim()}
                className="rounded-md border border-slate-300 text-sm px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {pasteLookupLoading ? "Đang tra cứu..." : "Tra cứu & thêm vào danh sách chọn"}
              </button>
              {pasteLookupNotice && (
                <p className="text-xs text-slate-500">{pasteLookupNotice}</p>
              )}
            </div>
          </details>

          <button
            onClick={handleAssignExisting}
            disabled={assigning || selectedStudentIds.size === 0}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {assigning
              ? "Đang gán..."
              : `Gán ${selectedStudentIds.size || ""} thí sinh đã chọn`}
          </button>
        </div>
      )}

      {showGenerateForm && (
        <form
          onSubmit={handleGenerate}
          className="space-y-3 bg-white border border-slate-200 rounded-lg p-4 max-w-lg"
        >
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Số lượng mã cần sinh</label>
            <input
              type="number"
              min={1}
              max={2000}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">
              Danh sách tên (tùy chọn, mỗi dòng 1 tên, phải khớp đúng số lượng ở trên)
            </label>
            <textarea
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              rows={5}
              placeholder={"Nguyễn Văn A\nTrần Thị B\n..."}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {submitting ? "Đang sinh mã..." : "Sinh mã"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải...</p>
      ) : codes.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có mã số nào.</p>
      ) : (
        <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Mã số</th>
                <th className="px-4 py-2 font-medium">Tên thí sinh</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {codes.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2 font-mono text-slate-900">{c.code}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {c.student_name || <span className="text-slate-400">—</span>}{" "}
                    <button
                      onClick={() => handleRenameInline(c.id, c.student_name)}
                      className="text-xs text-slate-400 hover:underline ml-1"
                    >
                      sửa
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {(c.status === "in_progress" || c.status === "submitted") && (
                      <button
                        onClick={() => handleReset(c.id)}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        Reset
                      </button>
                    )}
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
