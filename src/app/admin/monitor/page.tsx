"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Radio } from "lucide-react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SessionRow = {
  student_code_id: string;
  code: string;
  student_name: string | null;
  status: string;
  session_id: string | null;
  student_id?: string | null;
  violation_count: number;
  deadline_at: string | null;
  submitted_at: string | null;
};

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  unused: { label: "Chưa vào", variant: "outline" },
  in_progress: { label: "Đang thi", variant: "default" },
  submitted: { label: "Đã nộp", variant: "secondary" },
  reset: { label: "Đã reset", variant: "outline" },
};

function Remaining({ deadlineAt, status }: { deadlineAt: string | null; status: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (status !== "in_progress" || !deadlineAt) return <span className="text-muted-foreground">—</span>;
  const ms = new Date(deadlineAt).getTime() - now;
  if (ms <= 0) return <span className="text-destructive text-xs">Hết giờ</span>;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <span className={`font-mono text-xs ${ms < 5 * 60000 ? "text-amber-600" : ""}`}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

/** Giám sát trực tiếp toàn hệ thống — filter theo đề trong khóa đang chọn. */
export default function MonitorPage() {
  const [examId, setExamId] = useState("");
  const { data: examsData } = useCachedFetch<{ exams: { id: string; name: string; is_active: boolean }[] }>(
    "/api/admin/exams"
  );
  const exams = examsData?.exams ?? [];
  // Ưu tiên chọn đề đang mở đầu tiên.
  useEffect(() => {
    if (!examId && exams.length > 0) {
      setExamId((exams.find((e) => e.is_active) ?? exams[0]).id);
    }
  }, [examId, exams]);

  const { data: sessionsData, isLoading } = useCachedFetch<{ rows: SessionRow[] }>(
    examId ? `/api/admin/exams/${examId}/sessions` : null,
    5_000 // realtime nhẹ: refresh 5s
  );
  const rows = sessionsData?.rows ?? [];

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Radio className="h-5 w-5 text-emerald-600" /> Giám sát trực tiếp
        </h1>
        <div className="flex items-center gap-2">
          <Select value={examId} onValueChange={(v) => setExamId(v ?? "")}>
            <SelectTrigger className="w-[260px]">
              <SelectValue placeholder="Chọn đề thi">
                {exams.find((e) => e.id === examId)?.name ?? "Chọn đề thi"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {exams.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} {e.is_active ? "· đang mở" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {examId && (
            <Link
              href={`/admin/exams/${examId}/dashboard`}
              className="text-sm text-muted-foreground hover:text-foreground underline whitespace-nowrap"
            >
              Chi tiết & thao tác
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["Tổng", rows.length],
          ["Đang thi", counts.in_progress ?? 0],
          ["Đã nộp", counts.submitted ?? 0],
          ["Chưa vào", counts.unused ?? 0],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thí sinh (tự cập nhật mỗi 5 giây)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full animate-shimmer" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Đề này chưa có thí sinh nào được gán.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SBD</TableHead>
                  <TableHead className="hidden sm:table-cell">Tên</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Còn lại</TableHead>
                  <TableHead className="text-right">Vi phạm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const st = STATUS[r.status] ?? { label: r.status, variant: "outline" as const };
                  return (
                    <TableRow key={r.student_code_id}>
                      <TableCell className="font-mono text-xs">
                        {r.student_id ? (
                          <Link href={`/admin/students/${r.student_id}`} className="text-primary hover:underline">
                            {r.code}
                          </Link>
                        ) : (
                          r.code
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{r.student_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Remaining deadlineAt={r.deadline_at} status={r.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        {r.violation_count > 0 ? (
                          <span className="text-destructive font-medium">{r.violation_count}</span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
