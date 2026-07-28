"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useCachedFetch } from "@/lib/use-cached-fetch";

const PAGES = [
  { title: "Dashboard", href: "/admin" },
  { title: "Ngân hàng câu hỏi", href: "/admin/pools" },
  { title: "Đề thi", href: "/admin/exams" },
  { title: "Thí sinh", href: "/admin/students" },
  { title: "Giám sát trực tiếp", href: "/admin/monitor" },
  { title: "Bảng điểm & export", href: "/admin/results" },
  { title: "Leaderboard", href: "/admin/leaderboard" },
  { title: "Khóa thi", href: "/admin/terms" },
  { title: "Phân quyền", href: "/admin/access" },
  { title: "Audit log", href: "/admin/audit" },
  { title: "Cài đặt", href: "/admin/settings" },
];

/** Cmd+K — tìm nhanh trang + đề thi. */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useCachedFetch<{ exams: { id: string; name: string }[] }>(
    open ? "/api/admin/exams" : null
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border bg-transparent px-3 text-sm text-muted-foreground transition-colors hover:bg-accent w-40 sm:w-56"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left truncate">Tìm kiếm…</span>
        <kbd className="hidden sm:inline-flex text-[10px] font-mono border rounded px-1">⌘K</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Tìm trang, đề thi…" />
        <CommandList>
          <CommandEmpty>Không tìm thấy.</CommandEmpty>
          <CommandGroup heading="Trang">
            {PAGES.map((p) => (
              <CommandItem key={p.href} onSelect={() => go(p.href)}>
                {p.title}
              </CommandItem>
            ))}
          </CommandGroup>
          {(data?.exams?.length ?? 0) > 0 && (
            <CommandGroup heading="Đề thi">
              {data!.exams.map((e) => (
                <CommandItem key={e.id} onSelect={() => go(`/admin/exams/${e.id}`)}>
                  {e.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
