"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import {
  LayoutDashboard,
  Library,
  FileText,
  Users,
  Trophy,
  CalendarRange,
  Settings,
  LogOut,
  GraduationCap,
  ShieldCheck,
  ScrollText,
  Radio,
  BarChart3,
  Download,
} from "lucide-react";
import { CommandMenu } from "@/components/admin/CommandMenu";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import type { PermissionKey } from "@/lib/permissions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { TermSwitcher } from "@/components/admin/TermSwitcher";

/**
 * Admin shell (Sprint 2) — shadcn Sidebar + topbar, IA xếp theo user flow:
 * Chuẩn bị → Thí sinh → Giám sát/Kết quả → Khóa thi/Cài đặt.
 */

type NavItem = {
  href: string;
  title: string;
  icon: React.ComponentType;
  adminOnly?: boolean;
  /** Ẩn nếu supervisor không có permission này (admin luôn thấy). */
  permission?: PermissionKey;
};

// IA theo proposal: Tổng quan → Chuẩn bị kỳ thi → Thí sinh → Giám sát trực tiếp
// → Kết quả & Báo cáo → Khóa thi → Cài đặt.
const NAV: { label: string; items: NavItem[] }[] = [
  {
    label: "Tổng quan",
    items: [
      { href: "/admin", title: "Dashboard", icon: LayoutDashboard, permission: "view_dashboard" },
    ],
  },
  {
    label: "Chuẩn bị kỳ thi",
    items: [
      {
        href: "/admin/pools",
        title: "Ngân hàng câu hỏi",
        icon: Library,
        permission: "manage_questions",
      },
      { href: "/admin/exams", title: "Đề thi", icon: FileText },
    ],
  },
  {
    label: "Vận hành",
    items: [
      { href: "/admin/students", title: "Thí sinh", icon: Users, permission: "manage_students" },
      {
        href: "/admin/monitor",
        title: "Giám sát trực tiếp",
        icon: Radio,
        permission: "view_dashboard",
      },
    ],
  },
  {
    label: "Kết quả & Báo cáo",
    items: [
      {
        href: "/admin/results",
        title: "Bảng điểm & export",
        icon: BarChart3,
        permission: "view_results",
      },
      { href: "/admin/leaderboard", title: "Leaderboard", icon: Trophy, permission: "view_results" },
      { href: "/admin/export", title: "Xuất báo cáo", icon: Download, permission: "view_results" },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { href: "/admin/terms", title: "Khóa thi", icon: CalendarRange, adminOnly: true },
      { href: "/admin/access", title: "Phân quyền", icon: ShieldCheck, adminOnly: true },
      { href: "/admin/audit", title: "Audit log", icon: ScrollText, adminOnly: true },
      { href: "/admin/settings", title: "Cài đặt", icon: Settings, adminOnly: true },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminShell({
  children,
  logoutAction,
}: {
  children: React.ReactNode;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const { data: me } = useCachedFetch<{
    role: "admin" | "supervisor";
    permissions: PermissionKey[];
  }>("/api/admin/me");
  const role = me?.role ?? "admin";
  const permissions = me?.permissions;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold">Quản trị thi</span>
              <span className="text-xs text-muted-foreground">Quizz Đà Nẵng</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {NAV.map((group) => {
            const items = group.items.filter((i) => {
              if (role === "admin") return true;
              if (i.adminOnly) return false;
              if (i.permission && permissions) return permissions.includes(i.permission);
              return true;
            });
            if (items.length === 0) return null;
            return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(pathname, item.href)}
                        tooltip={item.title}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            );
          })}
        </SidebarContent>
        <SidebarFooter>
          <form action={logoutAction}>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton type="submit" tooltip="Đăng xuất">
                  <LogOut />
                  <span>Đăng xuất</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </form>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          {/* Topbar theo proposal: [Term switcher] [Search Cmd+K] [Theme] */}
          <TermSwitcher />
          <div className="ml-auto flex items-center gap-2">
            <CommandMenu />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
