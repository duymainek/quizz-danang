"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCachedFetch, invalidateCache } from "@/lib/use-cached-fetch";

type Term = { id: string; name: string; year: number; status: string };

/**
 * P0 — Term switcher: dropdown chọn Khóa thi trên header admin.
 * Chọn khóa → set cookie phía server → refresh để mọi trang/API scope lại.
 */
export function TermSwitcher() {
  const router = useRouter();
  const { data } = useCachedFetch<{ terms: Term[]; current_term_id: string }>(
    "/api/admin/terms"
  );
  const terms = data?.terms ?? [];
  const [currentId, setCurrentId] = useState<string>("");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (data?.current_term_id) setCurrentId(data.current_term_id);
  }, [data]);

  const onChange = async (id: string) => {
    if (!id || id === currentId) return;
    setSwitching(true);
    try {
      const res = await fetch(`/api/admin/terms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ select: true }),
      });
      if (res.ok) {
        setCurrentId(id);
        invalidateCache(); // đổi khóa → mọi cache theo khóa cũ vô hiệu
        router.refresh();
        // Các trang admin fetch client-side — reload để chắc chắn dữ liệu đúng khóa.
        window.location.reload();
      }
    } finally {
      setSwitching(false);
    }
  };

  if (terms.length === 0) return null;

  return (
    <select
      value={currentId}
      disabled={switching}
      onChange={(e) => onChange(e.target.value)}
      className="border-input h-9 rounded-md border bg-transparent px-3 text-sm shadow-xs outline-none max-w-[200px] transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      title="Khóa thi đang chọn"
    >
      {terms.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.status === "archived" ? " (đã lưu trữ)" : ""}
        </option>
      ))}
    </select>
  );
}
