import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-helpers";
import { resolveStudentSession } from "@/lib/student/session";

type DashboardRow = {
  exam_id: string;
  name: string;
  duration_minutes: number;
  is_active: boolean;
  monitoring_enabled: boolean;
  assignment_status: string;
  submitted_at: string | null;
  publish_score: boolean;
  total_score: number | null;
};

export async function GET() {
  try {
    const { student, db } = await resolveStudentSession();

    // RPC gộp assignments -> lượt thi gần nhất -> điểm thành 1 round-trip,
    // thay vì 3 query tuần tự (mỗi query phụ thuộc id rút ra từ query trước).
    const { data, error } = await db.rpc("get_student_dashboard", {
      p_student_id: student.id,
    });
    if (error) throw error;

    const rows = (data ?? []) as DashboardRow[];
    const exams = rows.map((r) => ({
      exam_id: r.exam_id,
      name: r.name,
      duration_minutes: r.duration_minutes,
      is_active: r.is_active,
      monitoring_enabled: r.monitoring_enabled,
      assignment_status: r.assignment_status,
      submitted_at: r.submitted_at,
      publish_score: r.publish_score,
      total_score: r.publish_score ? r.total_score : null,
    }));

    return NextResponse.json({
      student: { code: student.code, full_name: student.full_name },
      exams,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
