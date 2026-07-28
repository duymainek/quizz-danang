import { logoutAction } from "@/app/login/actions";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell logoutAction={logoutAction}>{children}</AdminShell>;
}
