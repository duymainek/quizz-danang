import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

function toCsvValue(v: string | number | null) {
  const s = v === null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const STATUS_LABEL: Record<string, string> = {
  unused: "Chua bat dau",
  in_progress: "Dang thi",
  submitted: "Da nop",
  auto_submitted: "Tu dong nop (vi pham/het gio)",
  reset: "Da reset",
};

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: examId } = await params;
    idParamSchema.parse(examId);
    const db = createAdminClient();

    const { data: exam } = await db.from("exams").select("name").eq("id", examId).single();

    const { data: codes, error } = await db
      .from("student_codes")
      .select(
        "code, student_name, status, exam_sessions(id, started_at, submitted_at, status, violation_count, created_at)"
      )
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    type SessionRow = {
      id: string;
      started_at: string;
      submitted_at: string | null;
      status: string;
      violation_count: number;
      created_at: string;
    };

    const allSessionIds = (codes ?? [])
      .flatMap((c) => (c.exam_sessions ?? []) as SessionRow[])
      .map((s) => s.id);

    const scoreBySessionId = new Map<string, number>();
    if (allSessionIds.length > 0) {
      const { data: scores, error: scoresErr } = await db
        .from("scores")
        .select("session_id, total_score")
        .in("session_id", allSessionIds);
      if (scoresErr) throw scoresErr;
      for (const s of scores ?? []) {
        scoreBySessionId.set(s.session_id, Number(s.total_score));
      }
    }

    const header = [
      "Ma so",
      "Ten thi sinh",
      "Trang thai",
      "Diem",
      "Thoi gian lam bai (phut)",
      "So lan vi pham",
    ];

    const rows = (codes ?? []).map((c) => {
      const sessions = (c.exam_sessions ?? []) as SessionRow[];
      const latest = sessions.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const durationMinutes =
        latest?.submitted_at && latest?.started_at
          ? Math.round(
              (new Date(latest.submitted_at).getTime() - new Date(latest.started_at).getTime()) /
                60000
            )
          : "";
      const score = latest ? scoreBySessionId.get(latest.id) : undefined;
      return [
        c.code,
        c.student_name ?? "",
        STATUS_LABEL[latest?.status ?? c.status] ?? c.status,
        score !== undefined ? score.toFixed(2) : "",
        durationMinutes,
        latest?.violation_count ?? 0,
      ];
    });

    const csv =
      "﻿" +
      [header, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\r\n");

    const filename = `ket-qua-${(exam?.name ?? "de-thi").replace(/[^a-zA-Z0-9-_]/g, "-")}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
