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

    // 2 query độc lập nhau (cả 2 chỉ cần examId) — chạy song song.
    const [examRes, assignmentsRes] = await Promise.all([
      db.from("exams").select("duration_minutes").eq("id", examId).single(),
      db
        .from("exam_assignments")
        .select(
          "id, status, created_at, students(id, code, full_name), exam_sessions!exam_sessions_exam_assignment_id_fkey(id, started_at, submitted_at, status, violation_count, created_at, extra_minutes, invalidated)"
        )
        .eq("exam_id", examId)
        .order("created_at", { ascending: true }),
    ]);
    const { data: exam, error: examErr } = examRes;
    if (examErr) throw examErr;
    const { data: assignments, error } = assignmentsRes;
    if (error) throw error;

    type SessionRow = {
      id: string;
      started_at: string;
      submitted_at: string | null;
      status: string;
      violation_count: number;
      created_at: string;
      extra_minutes?: number;
      invalidated?: boolean;
    };

    const rows = (assignments ?? []).map((a) => {
      const student = a.students as unknown as { id: string; code: string; full_name: string | null } | null;
      const sessions = (a.exam_sessions ?? []) as SessionRow[];
      const latest = sessions.sort(
        (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
      )[0];

      const deadlineAt = latest
        ? new Date(latest.started_at).getTime() +
          (exam.duration_minutes + (latest.extra_minutes ?? 0)) * 60_000
        : null;

      return {
        student_code_id: a.id,
        student_id: student?.id ?? null,
        code: student?.code ?? "",
        student_name: student?.full_name ?? null,
        status: a.status,
        session_id: latest?.id ?? null,
        // Trạng thái thật của lượt thi (khác `status` ở trên — đó là trạng
        // thái assignment, chỉ có 4 giá trị và không phân biệt được nộp thủ
        // công với bị tự động nộp). Dashboard cần cái này để chỉ hiện nút
        // "Resume" đúng cho lượt bị auto-submit.
        session_status: latest?.status ?? null,
        invalidated: latest?.invalidated ?? false,
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
