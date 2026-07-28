"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cache dữ liệu admin portal (stale-while-revalidate, không cần thêm dependency):
 * - Lần đầu: fetch bình thường.
 * - Chuyển trang quay lại: hiển thị NGAY dữ liệu cache (không skeleton),
 *   đồng thời fetch nền và cập nhật khi có dữ liệu mới.
 * - Cache theo URL, sống trong module scope (mất khi reload cứng — chấp nhận được).
 */

const cache = new Map<string, { data: unknown; at: number }>();
const TTL_MS = 5 * 60_000; // sau 5 phút coi như quá cũ, không dùng làm dữ liệu hiển thị tức thì

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function useCachedFetch<T>(url: string | null, intervalMs?: number) {
  const [data, setData] = useState<T | null>(() => {
    const cached = url ? cache.get(url) : undefined;
    return cached && Date.now() - cached.at < TTL_MS ? (cached.data as T) : null;
  });
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);

  const reload = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const res = await fetch(u);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      cache.set(u, { data: json, at: Date.now() });
      if (urlRef.current === u) {
        setData(json as T);
        setError(null);
      }
    } catch (e) {
      if (urlRef.current === u) {
        setError(e instanceof Error ? e.message : "Không tải được dữ liệu");
      }
    }
  }, []);

  useEffect(() => {
    urlRef.current = url;
    if (!url) return;
    const c = cache.get(url);
    if (c && Date.now() - c.at < TTL_MS) {
      setData(c.data as T);
    } else {
      setData(null);
    }
    setError(null);
    void reload(); // luôn revalidate nền
    if (intervalMs) {
      const id = setInterval(reload, intervalMs);
      return () => clearInterval(id);
    }
  }, [url, reload, intervalMs]);

  return { data, error, reload, isLoading: data === null && error === null };
}
