"use client";

import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { useCachedFetch } from "@/lib/use-cached-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Exam = {
  id: string;
  name: string;
  is_active: boolean;
  total_questions: number;
  student_codes_count: number;
};

/** Bảng điểm & export — chọn đề để xem chi tiết kết quả. */
export default function ResultsIndexPage() {
  const { data, isLoading } = useCachedFetch<{ exams: Exam[] }>("/api/admin/exams");
  const exams = data?.exams ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5" /> Bảng điểm & export
      </h1>

      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full animate-shimmer" />
          ))}
        </div>
      ) : exams.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Khóa thi này chưa có đề nào.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 stagger">
          {exams.map((e) => (
            <Card key={e.id} className="animate-fade-up">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">{e.name}</span>
                  <Badge variant={e.is_active ? "default" : "secondary"}>
                    {e.is_active ? "Đang mở" : "Đã đóng"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {e.total_questions} câu · {e.student_codes_count} thí sinh
                </p>
                <div className="flex items-center gap-3">
                  <a
                    href={`/api/admin/exams/${e.id}/results/export?format=csv`}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" /> CSV
                  </a>
                  <Link
                    href={`/admin/exams/${e.id}/results`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Xem bảng điểm →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
