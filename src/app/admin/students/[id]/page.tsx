"use client";

import { use } from "react";
import Link from "next/link";
import { ShieldAlert, User } from "lucide-react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
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

type Profile = {
  student: {
    id: string;
    code: string;
    full_name: string | null;
    birth_year: number | null;
    unit: string | null;
    suspicion_flags: { flag: string; at: string }[];
    created_at: string;
    term_name: string | null;
  };
  exams: {
    assignment_id: string;
    assignment_status: string;
    exam_id: string | null;
    exam_name: string;
    term_name: string | null;
    is_active: boolean;
    session_id: string | null;
    session_status: string | null;
    submitted_at: string | null;
    violation_count: number;
    invalidated: boolean;
    extra_minutes: number;
    attempts: number;
    total_score: number | null;
    manual_score: boolean;
    checked_in: boolean;
    checkin_device_matched: boolean | null;
  }[];
  login_summary: {
    device_count: number;
    total_logins: number;
    failed_logins: number;
    recent: { device_id: string | null; ip_address: string | null; created_at: string; success: boolean }[];
  };
};

const FLAG_LABEL: Record<string, string> = {
  multi_device: "Đa thiết bị",
  parallel_session: "Phiên song song",
  device_mismatch: "Lệch thiết bị check-in",
  no_checkin: "Không check-in",
  checkin_invalid: "QR không hợp lệ",
};

const STATUS_LABEL: Record<string, string> = {
  unused: "Chưa làm",
  in_progress: "Đang thi",
  submitted: "Đã nộp",
  auto_submitted: "Nộp tự động",
  reset: "Đã reset",
};

export default function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useCachedFetch<Profile>(`/api/admin/students/${id}`);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full animate-shimmer" />
        <Skeleton className="h-48 w-full animate-shimmer" />
      </div>
    );
  }

  const { student, exams, login_summary } = data;
  const flags = Array.isArray(student.suspicion_flags) ? student.suspicion_flags : [];

  return (
    <div className="space-y-6">
      <Link href="/admin/students" className="text-sm text-muted-foreground hover:underline">
        ← Danh sách thí sinh
      </Link>

      {/* Header hồ sơ */}
      <Card>
        <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold font-mono">{student.code}</h1>
              {flags.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="h-3 w-3" /> {flags.length} cờ nghi vấn
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {student.full_name ?? "Chưa có tên"}
              {student.birth_year ? ` · sinh ${student.birth_year}` : ""}
              {student.unit ? ` · ${student.unit}` : ""}
              {student.term_name ? ` · ${student.term_name}` : ""}
            </p>
          </div>
          <div className="text-sm text-muted-foreground text-right space-y-0.5 shrink-0">
            <p>{login_summary.device_count} thiết bị đã dùng</p>
            <p>
              {login_summary.total_logins} lượt đăng nhập
              {login_summary.failed_logins > 0 && (
                <span className="text-destructive"> · {login_summary.failed_logins} thất bại</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cờ nghi vấn */}
      {flags.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Cờ nghi vấn (silent)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {flags.map((f, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <Badge variant="outline">{FLAG_LABEL[f.flag] ?? f.flag}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(f.at).toLocaleString("vi-VN")}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Toàn bộ đề thi */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Đề thi ({exams.length}) — bao gồm mọi khóa
          </CardTitle>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa được gán đề nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đề thi</TableHead>
                  <TableHead className="hidden md:table-cell">Khóa</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Vi phạm</TableHead>
                  <TableHead className="hidden lg:table-cell">Check-in</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((e) => (
                  <TableRow key={e.assignment_id} className={e.invalidated ? "opacity-50" : ""}>
                    <TableCell className="max-w-[220px]">
                      <p className="truncate font-medium">{e.exam_name}</p>
                      {e.attempts > 1 && (
                        <p className="text-xs text-muted-foreground">{e.attempts} lượt thi</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {e.term_name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {e.invalidated ? (
                        <Badge variant="destructive">Đã hủy KQ</Badge>
                      ) : (
                        <Badge
                          variant={
                            e.session_status === "in_progress"
                              ? "default"
                              : e.assignment_status === "submitted"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {STATUS_LABEL[e.session_status ?? e.assignment_status] ??
                            e.assignment_status}
                        </Badge>
                      )}
                      {e.extra_minutes > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          +{e.extra_minutes}p
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {e.total_score !== null ? (
                        <>
                          {e.total_score.toFixed(2)}
                          {e.manual_score && (
                            <span className="text-xs text-amber-600 ml-1" title="Điểm sửa tay">
                              ✎
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right hidden sm:table-cell">
                      {e.violation_count > 0 ? (
                        <span className="text-destructive font-medium">{e.violation_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {!e.checked_in ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : e.checkin_device_matched ? (
                        <Badge variant="secondary">Khớp</Badge>
                      ) : (
                        <Badge variant="destructive">Lệch thiết bị</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {e.exam_id && (
                        <div className="flex items-center justify-end gap-2 text-xs">
                          <Link
                            href={`/admin/exams/${e.exam_id}/dashboard`}
                            className="text-muted-foreground hover:text-foreground underline"
                          >
                            Giám sát
                          </Link>
                          {e.session_id && e.total_score !== null && (
                            <Link
                              href={`/admin/exams/${e.exam_id}/results/${e.session_id}`}
                              className="text-primary hover:underline"
                            >
                              Bài làm
                            </Link>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Lịch sử đăng nhập gần nhất */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đăng nhập gần nhất</CardTitle>
        </CardHeader>
        <CardContent>
          {login_summary.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa đăng nhập lần nào.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Kết quả</TableHead>
                  <TableHead className="hidden sm:table-cell">IP</TableHead>
                  <TableHead className="hidden md:table-cell">Thiết bị</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {login_summary.recent.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell>
                      {l.success ? (
                        <Badge variant="secondary">Thành công</Badge>
                      ) : (
                        <Badge variant="destructive">Sai mã</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      {l.ip_address ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs max-w-[160px] truncate">
                      {l.device_id ?? "—"}
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
