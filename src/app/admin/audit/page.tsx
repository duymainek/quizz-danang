"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AuditRow = {
  id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const ACTION_LABEL: Record<string, string> = {
  reset_student_code: "Reset lượt thi",
  extend_session: "Gia hạn giờ",
  force_submit: "Nộp hộ",
  invalidate_session: "Hủy kết quả",
  restore_session: "Khôi phục kết quả",
  set_manual_score: "Sửa điểm",
  dismiss_violation: "Bỏ qua vi phạm",
  rescore_exam: "Chấm lại đề",
  create_invite: "Tạo link mời",
  accept_invite: "Kích hoạt tài khoản",
};

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [actor, setActor] = useState("");
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(async (p: number, actorQ: string) => {
    const params = new URLSearchParams({ page: String(p) });
    if (actorQ) params.set("actor", actorQ);
    const res = await fetch(`/api/admin/audit?${params}`);
    const json = await res.json();
    if (res.ok) {
      setRows(json.rows);
      setTotal(json.total);
      setPageSize(json.page_size);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(page, actor), actor ? 300 : 0);
    return () => clearTimeout(t);
  }, [page, actor, load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <ScrollText className="h-5 w-5" /> Audit log
        </h1>
        <input
          value={actor}
          onChange={(e) => {
            setActor(e.target.value);
            setPage(0);
          }}
          placeholder="Lọc theo email người thao tác…"
          className="border rounded-md px-3 py-2 text-sm w-64 bg-background"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {total} bản ghi — mọi thao tác của admin/giám sát viên đều được lưu vết
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rows === null ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full animate-shimmer" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Không có bản ghi nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Người thao tác</TableHead>
                  <TableHead>Hành động</TableHead>
                  <TableHead className="hidden md:table-cell">Chi tiết</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-sm">{r.actor_email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ACTION_LABEL[r.action] ?? r.action}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[320px] truncate font-mono">
                      {r.metadata ? JSON.stringify(r.metadata) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 mt-4 text-sm">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border px-3 py-1.5 disabled:opacity-40"
              >
                Trước
              </button>
              <span className="text-muted-foreground">
                {page + 1}/{totalPages}
              </span>
              <button
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border px-3 py-1.5 disabled:opacity-40"
              >
                Sau
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
