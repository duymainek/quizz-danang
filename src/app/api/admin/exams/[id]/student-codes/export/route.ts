import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

function toCsvValue(v: string | null) {
  const s = v ?? "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: examId } = await params;
    idParamSchema.parse(examId);
    const db = createAdminClient();

    const { data: exam } = await db.from("exams").select("name").eq("id", examId).single();
    const { data, error } = await db
      .from("student_codes")
      .select("code, student_name, status")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const header = ["Ma so", "Ten thi sinh", "Trang thai"];
    const statusLabel: Record<string, string> = {
      unused: "Chua dung",
      in_progress: "Dang thi",
      submitted: "Da nop",
      reset: "Da reset",
    };
    const rows = (data ?? []).map((r) => [
      r.code,
      r.student_name ?? "",
      statusLabel[r.status] ?? r.status,
    ]);

    // Thêm UTF-8 BOM để Excel Windows đọc đúng tiếng Việt có dấu.
    const csv =
      "﻿" +
      [header, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\r\n");

    const filename = `ma-so-${(exam?.name ?? "de-thi").replace(/[^a-zA-Z0-9-_]/g, "-")}.csv`;

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
