import Link from "next/link";
import { logoutAction } from "@/app/login/actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <nav className="flex items-center gap-6 text-sm">
            <span className="font-semibold text-slate-900">Quản trị thi</span>
            <Link href="/admin/subjects" className="text-slate-600 hover:text-slate-900">
              Môn thi & câu hỏi
            </Link>
            <Link href="/admin/exams" className="text-slate-600 hover:text-slate-900">
              Đề thi
            </Link>
          </nav>
          <form action={logoutAction}>
            <button className="text-sm text-slate-500 hover:text-slate-900">
              Đăng xuất
            </button>
          </form>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
