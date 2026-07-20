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

    const { data: codes, error } = await db
      .from("student_codes")
      .select(
        "id, code, student_name, status, exam_sessions(id, started_at, submitted_at, status, violation_count, created_at)"
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

    // Lấy điểm bằng 1 truy vấn riêng thay vì embed 3 tầng qua PostgREST —
    // tách rõ ràng, dễ debug, và tránh phụ thuộc cách PostgREST suy luận
    // quan hệ FK gián tiếp qua bảng trung gian.
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
        // Cột numeric trả về dạng string qua PostgREST — luôn ép kiểu Number.
        scoreBySessionId.set(s.session_id, Number(s.total_score));
      }
    }

    const rows = (codes ?? []).map((c) => {
      const sessions = (c.exam_sessions ?? []) as SessionRow[];
      const latest = sessions.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const durationSeconds =
        latest?.submitted_at && latest?.started_at
          ? Math.round(
              (new Date(latest.submitted_at).getTime() - new Date(latest.started_at).getTime()) /
                1000
            )
          : null;

      return {
        student_code_id: c.id,
        code: c.code,
        student_name: c.student_name,
        status: c.status,
        session_id: latest?.id ?? null,
        session_status: latest?.status ?? null,
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
