"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { ExternalLink, QrCode } from "lucide-react";
import { ExamTabs } from "@/components/admin/ExamTabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CheckinData = {
  enabled: boolean;
  rotate_seconds: number;
  token: string | null;
  expires_at: string | null;
  submitted_count: number;
  checkins: {
    id: string;
    created_at: string;
    device_matched: boolean | null;
    code: string;
    full_name: string | null;
  }[];
};

export default function ExamCheckinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: examId } = use(params);
  const [data, setData] = useState<CheckinData | null>(null);
  const [toggling, setToggling] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/exams/${examId}/checkin`);
      const json = await res.json();
      if (res.ok) {
        setData(json);
        // Render QR inline ngay trong tab (token rotate → QR tự đổi theo).
        if (json.enabled && json.token) {
          const url = `${window.location.origin}/checkin?token=${json.token}`;
          setQrDataUrl(await QRCode.toDataURL(url, { width: 280, margin: 1 }));
        } else {
          setQrDataUrl(null);
        }
      }
    } catch {
      // poll sẽ thử lại
    }
  }, [examId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function toggleEnabled(checked: boolean) {
    setToggling(true);
    try {
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "exit_checkin_enabled",
          value: checked,
          scope: "exam",
          exam_id: examId,
        }),
      });
      await load();
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="space-y-6">
      <ExamTabs examId={examId} active="checkin" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <QrCode className="h-5 w-5" /> Check-in rời phòng
        </h1>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={data?.enabled ?? false}
            disabled={toggling || data === null}
            onCheckedChange={(v) => toggleEnabled(v === true)}
          />
          Bật check-in cho đề này
        </label>
      </div>

      {data === null ? (
        <Skeleton className="h-40 w-full animate-shimmer" />
      ) : !data.enabled ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Check-in đang tắt. Bật lên để yêu cầu thí sinh quét QR tại phòng trước khi rời
            đi — bài nộp mà không check-in sẽ được đánh dấu để rà soát.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Màn hình QR cho phòng thi</CardTitle>
              <CardDescription>
                Mở trang QR toàn màn hình và chiếu ở cửa phòng — mã tự đổi mỗi{" "}
                {data.rotate_seconds} giây, chụp gửi ra ngoài sẽ vô dụng.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row items-center gap-6">
              {/* QR hiển thị NGAY trong tab — không cần mở tab mới */}
              {qrDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrDataUrl}
                  alt="QR check-in"
                  className="rounded-xl border p-2 w-[220px] h-[220px] bg-white animate-scale-in"
                />
              ) : (
                <Skeleton className="w-[220px] h-[220px] rounded-xl animate-shimmer" />
              )}
              <div className="space-y-3 text-center sm:text-left">
                <p className="text-sm text-muted-foreground">
                  Thí sinh quét mã này bằng chính thiết bị đã làm bài. Mã tự đổi mỗi{" "}
                  {data.rotate_seconds}s.
                </p>
                <Link
                  href={`/admin/exams/${examId}/checkin/display`}
                  target="_blank"
                  className="inline-flex items-center gap-2 rounded-md border text-sm font-medium px-4 py-2 transition-all duration-150 active:scale-[0.98] hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" /> Phóng to cho máy chiếu
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Đã check-in {data.checkins.length}/{data.submitted_count} bài đã nộp
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.checkins.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có thí sinh check-in.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SBD</TableHead>
                      <TableHead className="hidden sm:table-cell">Tên</TableHead>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Thiết bị</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.checkins.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.code}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {c.full_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(c.created_at).toLocaleTimeString("vi-VN")}
                        </TableCell>
                        <TableCell>
                          {c.device_matched ? (
                            <Badge variant="secondary">Khớp</Badge>
                          ) : (
                            <Badge variant="destructive">Lệch thiết bị</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
