"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ExportPage() {
  const [examId, setExamId] = useState<string>("");
  const { data } = useCachedFetch<{ exams: { id: string; name: string }[] }>(
    "/api/admin/leaderboard"
  );
  const exams = data?.exams ?? [];

  useEffect(() => {
    if (!examId && exams.length > 0) setExamId(exams[0].id);
  }, [examId, exams]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Xuất báo cáo</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export theo đề thi</CardTitle>
          <CardDescription>
            Bảng điểm chi tiết của 1 đề — SBD, tên, trạng thái, điểm, thời gian làm bài, số lần
            vi phạm.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Select value={examId} onValueChange={(v) => setExamId(v ?? "")}>
            <SelectTrigger className="w-[280px]">
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
          <a
            href={examId ? `/api/admin/exams/${examId}/results/export?format=csv` : undefined}
            aria-disabled={!examId}
            className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${
              examId
                ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                : "pointer-events-none border-slate-200 text-slate-400"
            }`}
          >
            <Download className="h-4 w-4" />
            Tải CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export theo khóa thi</CardTitle>
          <CardDescription>
            Bảng tổng hợp cả khóa — mỗi dòng 1 thí sinh, mỗi cột 1 đề, kèm tổng điểm cộng dồn và
            số đề đã hoàn thành. Chỉ tính lượt thi mới nhất/hợp lệ của mỗi đề.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="/api/admin/export/term"
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Tải CSV toàn khóa
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
