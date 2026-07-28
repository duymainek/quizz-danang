"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Trophy } from "lucide-react";
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

type Row = {
  rank: number;
  student_id?: string | null;
  code: string;
  full_name: string | null;
  unit: string | null;
  total_score: number;
  duration_seconds: number | null;
  violation_count: number;
  auto_submitted: boolean;
};

const MEDALS = ["🥇", "🥈", "🥉"];

function formatDuration(sec: number | null) {
  if (sec === null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LeaderboardPage() {
  const [examId, setExamId] = useState<string>("");
  const { data, isLoading: loading } = useCachedFetch<{
    exams: { id: string; name: string }[];
    rows: Row[];
  }>(examId ? `/api/admin/leaderboard?exam_id=${examId}` : "/api/admin/leaderboard");
  const exams = data?.exams ?? [];
  const rows = data?.rows ?? null;

  // Tự chọn đề đầu tiên khi có danh sách.
  useEffect(() => {
    if (!examId && exams.length > 0) setExamId(exams[0].id);
  }, [examId, exams]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" /> Leaderboard
        </h1>
        <Select value={examId} onValueChange={(v) => setExamId(v ?? "")}>
          <SelectTrigger className="w-[260px]">
            {/* Hiển thị TÊN đề thay vì id — SelectValue mặc định render raw value */}
            <SelectValue placeholder="Chọn đề thi">
              {exams.find((e) => e.id === examId)?.name ?? "Chọn đề thi"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {exams.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Xếp hạng theo điểm — tie-break bằng thời gian làm bài
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading || rows === null ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full animate-shimmer" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có bài thi nào được chấm cho đề này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Hạng</TableHead>
                  <TableHead>SBD</TableHead>
                  <TableHead className="hidden sm:table-cell">Tên</TableHead>
                  <TableHead className="hidden md:table-cell">Đơn vị</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Thời gian</TableHead>
                  <TableHead className="text-right">Vi phạm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.code} className={r.rank <= 3 ? "bg-amber-50/50" : ""}>
                    <TableCell className="font-semibold">
                      {r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.student_id ? (
                        <Link href={`/admin/students/${r.student_id}`} className="text-primary hover:underline">
                          {r.code}
                        </Link>
                      ) : (
                        r.code
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{r.full_name ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {r.unit ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {r.total_score.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell font-mono text-xs">
                      {formatDuration(r.duration_seconds)}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.violation_count > 0 ? (
                        <Badge variant="destructive">{r.violation_count}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                      {r.auto_submitted && (
                        <Badge variant="outline" className="ml-1">
                          Auto
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
