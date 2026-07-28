import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: examId } = await params;
    idParamSchema.parse(examId);
    const db = createAdminClient();

    const { data: assignments, error } = await db
      .from("exam_assignments")
      .select(
        "id, status, created_at, students(id, code, full_name), exam_sessions!exam_sessions_exam_assignment_id_fkey(id, started_at, submitted_at, status, violation_count, created_at, invalidated)"
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
      invalidated?: boolean;
    };

    const allSessionIds = (assignments ?? [])
      .flatMap((a) => (a.exam_sessions ?? []) as SessionRow[])
      .map((s) => s.id);

    const scoreBySessionId = new Map<string, number>();
    if (allSessionIds.length > 0) {
      const { data: scores, error: scoresErr } = await db
        .from("scores")
        .select("session_id, total_score, manual_score")
        .in("session_id", allSessionIds);
      if (scoresErr) throw scoresErr;
      for (const s of scores ?? []) {
        // Điểm sửa tay ưu tiên hơn điểm máy chấm.
        scoreBySessionId.set(s.session_id, Number(s.manual_score ?? s.total_score));
      }
    }

    const rows = (assignments ?? []).map((a) => {
      const student = a.students as unknown as { id: string; code: string; full_name: string | null } | null;
      const sessions = (a.exam_sessions ?? []) as SessionRow[];
      const latest = sessions.sort(
        (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
      )[0];
      const durationSeconds =
        latest?.submitted_at && latest?.started_at
          ? Math.round(
              (new Date(latest.submitted_at).getTime() - new Date(latest.started_at).getTime()) /
                1000
            )
          : null;

      return {
        student_code_id: a.id,
        student_id: student?.id ?? null,
        code: student?.code ?? "",
        student_name: student?.full_name ?? null,
        status: a.status,
        session_id: latest?.id ?? null,
        session_status: latest?.status ?? null,
        invalidated: latest?.invalidated ?? false,
        total_score: latest ? scoreBySessionId.get(latest.id) ?? null : null,
        violation_count: latest?.violation_count ?? 0,
        duration_seconds: durationSeconds,
      };
    });

    const scored = rows.filter((r) => r.total_score !== null);
    const summary = {
      total_codes: rows.length,
      submitted_count: rows.filter((r) => r.status === "submitted").length,
      average_score:
        scored.length > 0
          ? scored.reduce((s, r) => s + (r.total_score ?? 0), 0) / scored.length
          : null,
      violated_count: rows.filter((r) => r.violation_count > 0).length,
      auto_submitted_count: rows.filter((r) => r.session_status === "auto_submitted").length,
    };

    return NextResponse.json({ rows, summary });
  } catch (err) {
    return handleApiError(err);
  }
}
