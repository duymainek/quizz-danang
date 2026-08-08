"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { Activity, AlertTriangle, CheckCircle2, FileText, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Overview = {
  total_exams: number;
  active_exams: number;
  in_progress_sessions: number;
  submitted_today: number;
  violations_today: number;
  submissions_by_day: { date: string; count: number }[];
  score_distribution: { range: string; min: number; max: number; count: number }[];
  score_details: {
    session_id: string;
    exam_id: string;
    code: string;
    full_name: string | null;
    exam_name: string;
    total_score: number;
  }[];
  recent_sessions: {
    id: string;
    status: string;
    submitted_at: string | null;
    violation_count: number;
    exam_name: string;
    code: string;
    full_name: string | null;
  }[];
  active_exams_summary: {
    id: string;
    name: string;
    total: number;
    in_progress: number;
    submitted: number;
    unused: number;
  }[];
};

type SuspicionRow = {
  id: string;
  code: string;
  full_name: string | null;
  flags: { flag: string; at: string }[];
  risk_score: number;
};

const FLAG_LABEL: Record<string, string> = {
  multi_device: "Đa thiết bị",
  parallel_session: "Phiên song song",
  device_mismatch: "Lệch thiết bị check-in",
  no_checkin: "Không check-in",
  checkin_invalid: "QR không hợp lệ",
};

const SESSION_STATUS: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  in_progress: { label: "Đang thi", variant: "default" },
  submitted: { label: "Đã nộp", variant: "secondary" },
  auto_submitted: { label: "Nộp tự động", variant: "destructive" },
  reset: { label: "Đã reset", variant: "outline" },
};

const areaConfig = {
  count: { label: "Lượt nộp", color: "var(--chart-1)" },
} satisfies ChartConfig;

const barConfig = {
  count: { label: "Số bài", color: "var(--chart-2)" },
} satisfies ChartConfig;

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  loading,
}: {
  title: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16 animate-shimmer" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AdminOverviewPage() {
  const router = useRouter();
  // Cache + tự refresh mỗi 30s (dashboard cần realtime nhẹ).
  const { data, error, isLoading: loading } = useCachedFetch<Overview>(
    "/api/admin/overview",
    30_000
  );
  const { data: suspicionData } = useCachedFetch<{ rows: SuspicionRow[] }>(
    "/api/admin/suspicion",
    60_000
  );
  const suspicion = suspicionData?.rows ?? null;
  // Mốc điểm đang chọn trên biểu đồ "Phân bố điểm" (bấm cột để lọc danh sách
  // thí sinh + đề đạt đúng mốc đó bên dưới; bấm lại cùng cột để bỏ chọn).
  // Dùng chỉ số bucket (khớp đúng cách server tính floor(score), điểm 10 gộp
  // vào mốc cuối) thay vì so sánh min/max trực tiếp để tránh lệch biên.
  const [selectedRange, setSelectedRange] = useState<{ range: string; min: number; max: number } | null>(
    null
  );
  const filteredByScore =
    selectedRange && data
      ? data.score_details.filter((d) => {
          const bucketIndex = Math.min(9, Math.max(0, Math.floor(Number(d.total_score))));
          return bucketIndex === selectedRange.min;
        })
      : null;

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Đang thi"
          value={data?.in_progress_sessions}
          icon={Activity}
          hint="Phiên đang diễn ra"
          loading={loading}
        />
        <StatCard
          title="Đã nộp hôm nay"
          value={data?.submitted_today}
          icon={CheckCircle2}
          loading={loading}
        />
        <StatCard
          title="Vi phạm hôm nay"
          value={data?.violations_today}
          icon={AlertTriangle}
          loading={loading}
        />
        <StatCard
          title="Đề đang mở"
          value={data?.active_exams}
          icon={FileText}
          hint={`Tổng ${data?.total_exams ?? 0} đề trong khóa`}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Lượt nộp bài</CardTitle>
            <CardDescription>14 ngày gần nhất</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full animate-shimmer" />
            ) : (
              <ChartContainer config={areaConfig} className="h-[200px] w-full">
                <AreaChart data={data?.submissions_by_day ?? []}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="count"
                    type="monotone"
                    fill="var(--color-count)"
                    fillOpacity={0.2}
                    stroke="var(--color-count)"
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Phân bố điểm</CardTitle>
            <CardDescription>
              Toàn bộ bài đã chấm trong khóa, mỗi mốc 1 điểm — bấm vào cột để xem chi tiết
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[200px] w-full animate-shimmer" />
            ) : (
              <ChartContainer config={barConfig} className="h-[200px] w-full">
                <BarChart data={data?.score_distribution ?? []}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="range" tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={4}
                    className="cursor-pointer"
                    onClick={(bar: {
                      payload?: { range: string; min: number; max: number; count: number };
                    }) => {
                      const entry = bar?.payload;
                      if (!entry || entry.count === 0) return;
                      setSelectedRange((cur) =>
                        cur?.range === entry.range
                          ? null
                          : { range: entry.range, min: entry.min, max: entry.max }
                      );
                    }}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedRange && (
        <Card>
          <CardHeader>
            <CardTitle>Mốc điểm {selectedRange.range}</CardTitle>
            <CardDescription>
              {filteredByScore?.length ?? 0} bài đạt mốc điểm này — theo từng đề thi
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(filteredByScore?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Không có bài nào ở mốc điểm này.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SBD</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Đề thi</TableHead>
                    <TableHead className="text-right">Điểm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredByScore!
                    .slice()
                    .sort((a, b) => a.exam_name.localeCompare(b.exam_name) || a.code.localeCompare(b.code))
                    .map((r) => (
                      <TableRow
                        key={r.session_id}
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => router.push(`/admin/exams/${r.exam_id}/results/${r.session_id}`)}
                      >
                        <TableCell className="font-mono text-xs text-primary hover:underline">
                          {r.code}
                        </TableCell>
                        <TableCell>{r.full_name ?? "—"}</TableCell>
                        <TableCell>{r.exam_name}</TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(r.total_score).toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Phiên thi gần nhất</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full animate-shimmer" />
                ))}
              </div>
            ) : (data?.recent_sessions?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có phiên thi nào.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SBD</TableHead>
                    <TableHead className="hidden sm:table-cell">Tên</TableHead>
                    <TableHead className="hidden md:table-cell">Đề</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Vi phạm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.recent_sessions.map((s) => {
                    const st = SESSION_STATUS[s.status] ?? {
                      label: s.status,
                      variant: "outline" as const,
                    };
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.code}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {s.full_name ?? "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[180px] truncate">
                          {s.exam_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {s.violation_count > 0 ? (
                            <span className="text-destructive font-medium">
                              {s.violation_count}
                            </span>
                          ) : (
                            0
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

        <Card>
          <CardHeader>
            <CardTitle>Đề đang mở</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <>
                <Skeleton className="h-14 w-full animate-shimmer" />
                <Skeleton className="h-14 w-full animate-shimmer" />
              </>
            ) : (data?.active_exams_summary?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Không có đề nào đang mở.</p>
            ) : (
              data?.active_exams_summary.map((e) => (
                <Link
                  key={e.id}
                  href={`/admin/exams/${e.id}/dashboard`}
                  className="block rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <p className="text-sm font-medium truncate">{e.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {e.in_progress} đang thi · {e.submitted} đã nộp · {e.unused} chưa vào
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* P6 — Panel đối tượng nghi vấn (silent detection) */}
      {(suspicion?.length ?? 0) > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Đối tượng nghi vấn
            </CardTitle>
            <CardDescription>
              Cờ được gắn tự động, không hiển thị cho thí sinh — dùng để rà soát sau,
              không xử lý tự động.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SBD</TableHead>
                  <TableHead className="hidden sm:table-cell">Tên</TableHead>
                  <TableHead>Dấu hiệu</TableHead>
                  <TableHead className="text-right">Risk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suspicion!.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/admin/students/${r.id}`} className="hover:underline text-primary">
                        {r.code}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{r.full_name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.flags.map((f, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {FLAG_LABEL[f.flag] ?? f.flag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          r.risk_score >= 6
                            ? "destructive"
                            : r.risk_score >= 3
                              ? "default"
                              : "secondary"
                        }
                      >
                        {r.risk_score}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
