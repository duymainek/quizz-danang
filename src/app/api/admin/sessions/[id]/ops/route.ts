import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError, jsonError } from "@/lib/api-helpers";
import { scoreSession } from "@/lib/exam/scoring";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("extend"), minutes: z.number().int().min(1).max(120) }),
  z.object({ action: z.literal("force_submit") }),
  z.object({ action: z.literal("invalidate"), reason: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("restore") }),
  z.object({
    action: z.literal("set_score"),
    score: z.number().min(0).max(1000),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("resume"),
    minutes: z.number().int().min(1).max(120),
    reason: z.string().trim().min(1).max(500),
  }),
]);

/**
 * Ops trong ngày thi trên 1 phiên:
 * - extend / force_submit: giám sát viên được phép (xử lý sự cố tại phòng)
 * - invalidate / restore / set_score / resume: chỉ admin
 * Mọi thao tác đều ghi audit_logs.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = schema.parse(await req.json());
    const needResultPerm = ["invalidate", "restore", "set_score", "resume"].includes(body.action);
    const { user } = await requirePermission(needResultPerm ? "manage_results" : "ops_day");
    const db = createAdminClient();

    const { data: session, error } = await db
      .from("exam_sessions")
      .select(
        "id, status, started_at, submitted_at, extra_minutes, exam_assignment_id, invalidated, exams(duration_minutes)"
      )
      .eq("id", id)
      .single();
    if (error || !session) return jsonError("Không tìm thấy phiên thi", 404);

    // Fire-and-forget — audit log không cần chặn response.
    const audit = (action: string, metadata: Record<string, unknown>) => {
      void db
        .from("audit_logs")
        .insert({
          actor_email: user.email ?? "unknown",
          action,
          target_type: "exam_sessions",
          target_id: id,
          metadata,
        })
        .then(() => {});
    };

    switch (body.action) {
      case "extend": {
        if (session.status !== "in_progress") {
          return jsonError("Chỉ gia hạn được phiên đang thi", 409);
        }
        const newExtra = (session.extra_minutes ?? 0) + body.minutes;
        const { error: e } = await db
          .from("exam_sessions")
          .update({ extra_minutes: newExtra })
          .eq("id", id)
          .eq("status", "in_progress");
        if (e) throw e;
        audit("extend_session", { minutes: body.minutes, total_extra: newExtra });
        return NextResponse.json({ ok: true, extra_minutes: newExtra });
      }

      case "force_submit": {
        if (session.status !== "in_progress") {
          return jsonError("Phiên này không ở trạng thái đang thi", 409);
        }
        await scoreSession(id);
        // 2 update độc lập (không cái nào cần kết quả của cái kia) — chạy song song.
        const [sessionUpd, assignmentUpd] = await Promise.all([
          db
            .from("exam_sessions")
            .update({ status: "submitted", submitted_at: new Date().toISOString() })
            .eq("id", id)
            .eq("status", "in_progress"),
          db
            .from("exam_assignments")
            .update({ status: "submitted" })
            .eq("id", session.exam_assignment_id)
            .neq("status", "submitted"),
        ]);
        if (sessionUpd.error) throw sessionUpd.error;
        if (assignmentUpd.error) throw assignmentUpd.error;
        audit("force_submit", {});
        return NextResponse.json({ ok: true });
      }

      case "invalidate": {
        const { error: e } = await db
          .from("exam_sessions")
          .update({ invalidated: true, invalidated_reason: body.reason })
          .eq("id", id);
        if (e) throw e;
        audit("invalidate_session", { reason: body.reason });
        return NextResponse.json({ ok: true });
      }

      case "restore": {
        const { error: e } = await db
          .from("exam_sessions")
          .update({ invalidated: false, invalidated_reason: null })
          .eq("id", id);
        if (e) throw e;
        audit("restore_session", {});
        return NextResponse.json({ ok: true });
      }

      case "set_score": {
        const { error: e } = await db
          .from("scores")
          .update({
            manual_score: body.score,
            manual_reason: body.reason,
            manual_by: user.email ?? "unknown",
          })
          .eq("session_id", id);
        if (e) throw e;
        audit("set_manual_score", { score: body.score, reason: body.reason });
        return NextResponse.json({ ok: true });
      }

      case "resume": {
        // Mở lại 1 lượt thi đã bị TỰ ĐỘNG nộp (hết giờ hoặc vượt số lần vi
        // phạm) — dùng khi lý do là bất khả kháng (rớt mạng, sự cố thiết bị,
        // vi phạm oan...). Khác với "Reset lượt thi": KHÔNG tạo lượt mới,
        // GIỮ NGUYÊN đề đã random + toàn bộ đáp án đã lưu trong bảng `answers`,
        // reset bộ đếm vi phạm về 0 để không bị auto-submit lại ngay (log vi
        // phạm cũ vẫn giữ nguyên trong violation_logs để audit).
        //
        // Số phút cấp lại DO ADMIN NHẬP TAY (giống hệt "Extend"), không tự
        // tính "thời gian còn lại tại thời điểm bị cắt" như bản đầu — vì nếu
        // lượt bị cắt do HẾT GIỜ TỰ NHIÊN (không phải bị vi phạm cắt ngang
        // giữa chừng) thì thời gian còn lại tại thời điểm cắt luôn xấp xỉ 0,
        // khiến thí sinh chỉ được cấp vài chục giây rồi auto-submit lại ngay
        // lập tức — admin phải bấm resume lặp lại nhiều lần mới đủ thời gian
        // thực làm bài (bug thực tế đã gặp).
        if (session.status !== "auto_submitted") {
          return jsonError(
            "Chỉ resume được lượt bị TỰ ĐỘNG nộp (hết giờ/vi phạm) — dùng 'Nộp hộ' hoặc 'Hủy kết quả' cho các trường hợp khác",
            409
          );
        }
        if (session.invalidated) {
          return jsonError("Lượt thi đã bị hủy kết quả, không thể resume", 409);
        }
        const exam = session.exams as unknown as { duration_minutes: number } | null;
        if (!exam) throw new Error("Không tìm thấy thông tin đề thi của phiên này");

        const newDeadline = Date.now() + body.minutes * 60_000;
        const newExtraMinutes =
          Math.ceil((newDeadline - new Date(session.started_at).getTime()) / 60_000) -
          exam.duration_minutes;

        const { error: e } = await db
          .from("exam_sessions")
          .update({
            status: "in_progress",
            submitted_at: null,
            extra_minutes: newExtraMinutes,
            violation_count: 0,
          })
          .eq("id", id)
          .eq("status", "auto_submitted");
        if (e) throw e;

        await db
          .from("exam_assignments")
          .update({ status: "in_progress" })
          .eq("id", session.exam_assignment_id);

        // Điểm đã chấm lúc auto-submit không còn đúng nữa vì thí sinh sẽ làm
        // tiếp — xoá để tránh hiển thị nhầm điểm cũ trước khi nộp lại thật.
        await db.from("scores").delete().eq("session_id", id);

        audit("resume_session", { reason: body.reason, granted_minutes: body.minutes });
        return NextResponse.json({ ok: true, granted_minutes: body.minutes });
      }
    }
  } catch (err) {
    return handleApiError(err);
  }
}
