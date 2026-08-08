import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { getCurrentTermId } from "@/lib/terms";

function toCsvValue(v: string | number | null) {
  const s = v === null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

type Student = { id: string; code: string; full_name: string | null; unit: string | null };
type SessionRow = {
  id: string;
  status: string;
  created_at: string;
  invalidated: boolean;
  scores: { total_score: number; manual_score: number | null } | null;
};

/**
 * Export CSV pivot toàn khóa: mỗi dòng 1 thí sinh, mỗi cột 1 đề — dùng cùng
 * quy tắc "chỉ tính lượt thi mới nhất/hợp lệ mỗi assignment" như leaderboard
 * theo khóa. Bao gồm TOÀN BỘ thí sinh trong khóa (kể cả chưa thi đề nào),
 * không chỉ những người đã có điểm — khác với leaderboard chỉ xếp hạng
 * người đã thi. Sắp xếp theo số báo danh (đây là danh sách tra cứu, không
 * phải bảng xếp hạng). Embed thẳng scores vào exam_sessions (không query
 * .in("session_id", [...]) riêng) để tránh vượt giới hạn ~16KB header khi
 * khóa có nhiều thí sinh × nhiều đề (đã gặp lỗi HeadersOverflowError với
 * 457+ ID trước đây).
 */
export async function GET() {
  try {
    await requireAdminUser();
    const db = createAdminClient();
    const termId = await getCurrentTermId(db);

    const { data: exams, error: examsErr } = await db
      .from("exams")
      .select("id, name")
      .eq("term_id", termId)
      .order("created_at", { ascending: true });
    if (examsErr) throw examsErr;
    const examList = exams ?? [];
    const examIds = examList.map((e) => e.id);

    if (examIds.length === 0) {
      return new NextResponse("﻿Khóa thi chưa có đề nào.", {
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    const [{ data: allStudents, error: studentsErr }, { data: assignments, error }] =
      await Promise.all([
        db.from("students").select("id, code, full_name, unit").eq("term_id", termId),
        db
          .from("exam_assignments")
          .select(
            "exam_id, students(id, code, full_name, unit), exam_sessions!exam_sessions_exam_assignment_id_fkey(id, status, created_at, invalidated, scores(total_score, manual_score))"
          )
          .in("exam_id", examIds),
      ]);
    if (studentsErr) throw studentsErr;
    if (error) throw error;

    type Agg = {
      student: Student;
      scoreByExamId: Map<string, number>;
      examsCompleted: number;
      totalScore: number;
    };
    const byStudent = new Map<string, Agg>();

    // Khởi tạo TẤT CẢ thí sinh của khóa trước (kể cả chưa thi đề nào) — export
    // là danh sách toàn khóa, không chỉ những người đã có điểm.
    for (const s of allStudents ?? []) {
      byStudent.set(s.id, {
        student: s as Student,
        scoreByExamId: new Map<string, number>(),
        examsCompleted: 0,
        totalScore: 0,
      });
    }

    for (const a of assignments ?? []) {
      const student = (a.students as unknown as Student | null) ?? null;
      if (!student) continue;
      const sessions = (a.exam_sessions ?? []) as unknown as SessionRow[];
      const latest = sessions.sort(
        (x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()
      )[0];
      if (
        !latest ||
        latest.invalidated ||
        (latest.status !== "submitted" && latest.status !== "auto_submitted") ||
        !latest.scores
      ) {
        continue;
      }
      const score = Number(latest.scores.manual_score ?? latest.scores.total_score);

      const cur = byStudent.get(student.id) ?? {
        student,
        scoreByExamId: new Map<string, number>(),
        examsCompleted: 0,
        totalScore: 0,
      };
      cur.scoreByExamId.set(a.exam_id as string, score);
      cur.examsCompleted += 1;
      cur.totalScore += score;
      byStudent.set(student.id, cur);
    }

    const header = [
      "STT",
      "Ma so",
      "Ten thi sinh",
      "Don vi",
      ...examList.map((e) => e.name),
      "Tong diem",
      "So de hoan thanh",
    ];

    const rows = Array.from(byStudent.values())
      // Sắp theo số báo danh (numeric-aware — "9" đứng trước "10") thay vì
      // theo điểm, vì đây là danh sách toàn khóa để tra cứu, không phải bảng
      // xếp hạng (xếp hạng đã có riêng ở Leaderboard).
      .sort((a, b) => a.student.code.localeCompare(b.student.code, undefined, { numeric: true }))
      .map((r, i) => [
        i + 1,
        r.student.code,
        r.student.full_name ?? "",
        r.student.unit ?? "",
        ...examList.map((e) => {
          const s = r.scoreByExamId.get(e.id);
          return s !== undefined ? s.toFixed(2) : "";
        }),
        r.totalScore.toFixed(2),
        `${r.examsCompleted}/${examList.length}`,
      ]);

    const csv = "﻿" + [header, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\r\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tong-diem-toan-khoa.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
