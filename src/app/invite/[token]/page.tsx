"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

/** Trang người được mời đặt mật khẩu để trở thành giám sát viên/admin. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp");
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Không kích hoạt được tài khoản");
      router.replace("/login?invited=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Có lỗi xảy ra");
      setWorking(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm animate-scale-in"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-lg font-semibold text-slate-900">Kích hoạt tài khoản</h1>
          <p className="text-sm text-slate-500">
            Bạn được mời tham gia hệ thống quản trị thi. Đặt mật khẩu để bắt đầu.
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Mật khẩu (tối thiểu 8 ký tự)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500">Nhập lại mật khẩu</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={working}
          className="w-full rounded-lg bg-slate-900 text-white py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
        >
          {working ? "Đang kích hoạt…" : "Kích hoạt tài khoản"}
        </button>
      </form>
    </div>
  );
}
