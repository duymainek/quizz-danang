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

    const { data: exam, error: examErr } = await db
      .from("exams")
      .select("duration_minutes")
      .eq("id", examId)
      .single();
    if (examErr) throw examErr;

    const { data: codes, error } = await db
      .from("student_codes")
      .select(
        "id, code, student_name, status, exam_sessions(id, started_at, submitted_at, status, violation_count, created_at)"
      )
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const rows = (codes ?? []).map((c) => {
      const sessions = (c.exam_sessions ?? []) as {
        id: string;
        started_at: string;
        submitted_at: string | null;
        status: string;
        violation_count: number;
        created_at: string;
      }[];
      const latest = sessions.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      const deadlineAt = latest
        ? new Date(latest.started_at).getTime() + exam.duration_minutes * 60_000
        : null;

      return {
        student_code_id: c.id,
        code: c.code,
        student_name: c.student_name,
        status: c.status,
        session_id: latest?.id ?? null,
        violation_count: latest?.violation_count ?? 0,
        started_at: latest?.started_at ?? null,
        deadline_at: deadlineAt ? new Date(deadlineAt).toISOString() : null,
        submitted_at: latest?.submitted_at ?? null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    return handleApiError(err);
  }
}
