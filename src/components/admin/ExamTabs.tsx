"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Sprint 3 — Tab điều hướng chung cho mọi trang con của 1 đề thi,
 * giữ ngữ cảnh "đang xem đề nào" thay vì 4 URL rời rạc.
 */
export type ExamTabKey = "config" | "codes" | "monitor" | "checkin" | "results";

const TABS: { key: ExamTabKey; label: string; path: (id: string) => string }[] = [
  { key: "config", label: "Cấu hình", path: (id) => `/admin/exams/${id}` },
  { key: "codes", label: "Thí sinh & mã", path: (id) => `/admin/exams/${id}/codes` },
  { key: "monitor", label: "Giám sát", path: (id) => `/admin/exams/${id}/dashboard` },
  { key: "checkin", label: "Check-in", path: (id) => `/admin/exams/${id}/checkin` },
  { key: "results", label: "Kết quả", path: (id) => `/admin/exams/${id}/results` },
];

export function ExamTabs({ examId, active }: { examId: string; active: ExamTabKey }) {
  return (
    <div className="border-b overflow-x-auto">
      <nav className="flex gap-1 w-max">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.path(examId)}
            className={cn(
              "px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              active === t.key
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
