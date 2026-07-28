import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser, requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";
import { updateStudentSchema } from "@/lib/validation/students";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id } = await params;
    idParamSchema.parse(id);
    const db = createAdminClient();

    // Hồ sơ đầy đủ: thông tin + cờ nghi vấn + toàn bộ đề thi (xuyên khóa).
    const { data: student, error } = await db
      .from("students")
      .select(
        "id, code, full_name, birth_year, unit, suspicion_flags, created_at, term_id, exam_terms(name, year)"
      )
      .eq("id", id)
      .single();
    if (error || !student) return jsonError("Không tìm thấy thí sinh", 404);

    const { data: assignments, error: aErr } = await db
      .from("exam_assignments")
      .select(
        "id, status, created_at, exams(id, name, duration_minutes, is_active, exam_terms(name, year)), exam_sessions!exam_sessions_exam_assignment_id_fkey(id, status, started_at, submitted_at, violation_count, invalidated, extra_minutes, created_at)"
      )
      .eq("student_id", id)
      .order("created_at", { ascending: false });
    if (aErr) throw aErr;

    // Điểm + check-in + thống kê đăng nhập — query riêng, tránh embed sâu.
    type SessionRow = {
      id: string;
      status: string;
      started_at: string | null;
      submitted_at: string | null;
      violation_count: number;
      invalidated: boolean;
      extra_minutes: number;
      created_at: string;
    };
    const sessionIds = (assignments ?? []).flatMap((a) =>
      ((a.exam_sessions ?? []) as SessionRow[]).map((s) => s.id)
    );
    const [scoresRes, checkinsRes, loginsRes] = await Promise.all([
      sessionIds.length
        ? db
            .from("scores")
            .select("session_id, total_score, manual_score, manual_reason")
            .in("session_id", sessionIds)
        : Promise.resolve({ data: [], error: null }),
      db.from("checkins").select("exam_id, created_at, device_matched").eq("student_id", id),
      db
        .from("login_events")
        .select("device_id, ip_address, created_at, success")
        .eq("student_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (scoresRes.error) throw scoresRes.error;
    if (checkinsRes.error) throw checkinsRes.error;
    if (loginsRes.error) throw loginsRes.error;

    const scoreBySession = new Map(
      (scoresRes.data ?? []).map((s) => [
        s.session_id,
        {
          score: Number(s.manual_score ?? s.total_score),
          manual: s.manual_score !== null,
          manual_reason: s.manual_reason,
        },
      ])
    );
    const checkinByExam = new Map(
      (checkinsRes.data ?? []).map((c) => [c.exam_id, c])
    );

    const exams = (assignments ?? []).map((a) => {
      const exam = a.exams as unknown as {
        id: string;
        name: string;
        duration_minutes: number;
        is_active: boolean;
        exam_terms: { name: string; year: number } | null;
      } | null;
      const sessions = ((a.exam_sessions ?? []) as SessionRow[]).sort(
        (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
      );
      const latest = sessions[0] ?? null;
      const scoreInfo = latest ? scoreBySession.get(latest.id) : undefined;
      const checkin = exam ? checkinByExam.get(exam.id) : undefined;
      return {
        assignment_id: a.id,
        assignment_status: a.status,
        exam_id: exam?.id ?? null,
        exam_name: exam?.name ?? "(đề đã xóa)",
        term_name: exam?.exam_terms ? `${exam.exam_terms.name}` : null,
        is_active: exam?.is_active ?? false,
        session_id: latest?.id ?? null,
        session_status: latest?.status ?? null,
        started_at: latest?.started_at ?? null,
        submitted_at: latest?.submitted_at ?? null,
        violation_count: latest?.violation_count ?? 0,
        invalidated: latest?.invalidated ?? false,
        extra_minutes: latest?.extra_minutes ?? 0,
        attempts: sessions.length,
        total_score: scoreInfo?.score ?? null,
        manual_score: scoreInfo?.manual ?? false,
        manual_reason: scoreInfo?.manual_reason ?? null,
        checked_in: !!checkin,
        checkin_device_matched: checkin?.device_matched ?? null,
      };
    });

    const logins = loginsRes.data ?? [];
    const deviceCount = new Set(
      logins.filter((l) => l.success && l.device_id).map((l) => l.device_id)
    ).size;

    return NextResponse.json({
      student: {
        ...student,
        term_name: (student.exam_terms as unknown as { name: string } | null)?.name ?? null,
      },
      exams,
      login_summary: {
        device_count: deviceCount,
        total_logins: logins.filter((l) => l.success).length,
        failed_logins: logins.filter((l) => !l.success).length,
        recent: logins.slice(0, 10),
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requirePermission("manage_students");
    const { id } = await params;
    idParamSchema.parse(id);
    const body = updateStudentSchema.parse(await req.json());
    const db = createAdminClient();

    const patch: { code?: string; full_name?: string | null } = {};
    if (body.code !== undefined) patch.code = body.code.toUpperCase();
    if (body.full_name !== undefined) patch.full_name = body.full_name;

    const { data, error } = await db
      .from("students")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        return jsonError("Mã số này đã được dùng bởi thí sinh khác", 409);
      }
      throw error;
    }
    return NextResponse.json({ student: data });
  } catch (err) {
    return handleApiError(err);
  }
}
