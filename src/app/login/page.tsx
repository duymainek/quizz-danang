"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Footer } from "@/components/shared/Footer";

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <form
        action={formAction}
        className="w-full max-w-sm bg-white border border-slate-200 rounded-lg p-6 space-y-4 shadow-sm"
      >
        <h1 className="text-lg font-semibold text-slate-900">Đăng nhập quản trị</h1>
        <p className="text-sm text-slate-500">
          Dành cho admin / giám thị quản lý kỳ thi.
        </p>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-700">
            Mật khẩu
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
      <Footer className="absolute bottom-0 left-0 right-0" />
    </div>
  );
}
