"use client";

import { useEffect, useState } from "react";

export default function AdminSettingsPage() {
  const [rulesText, setRulesText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((json) => setRulesText(json.settings?.rules_text ?? ""))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules_text: rulesText }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cài đặt chung</h1>
        <p className="text-sm text-slate-500">
          Nội dung quy chế dự thi hiển thị ở trang giới thiệu (/landing) trước khi thí sinh
          vào trang cá nhân.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Đang tải...</p>
      ) : (
        <div className="space-y-3 bg-white border border-slate-200 rounded-lg p-5">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Quy chế dự thi</label>
            <textarea
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              rows={12}
              placeholder="Để trống sẽ dùng nội dung mặc định (không chuyển tab, không thoát fullscreen...)"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <p className="text-xs text-slate-500">
              Mỗi dòng sẽ hiển thị nguyên văn ở trang /landing. Để trống nếu muốn dùng danh sách
              quy chế mặc định của hệ thống.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </p>
          )}
          {saved && <p className="text-sm text-emerald-600">Đã lưu.</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-slate-900 text-white text-sm font-medium px-4 py-2 hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      )}
    </div>
  );
}
