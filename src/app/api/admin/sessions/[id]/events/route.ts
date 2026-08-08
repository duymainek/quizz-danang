import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api-helpers";
import { idParamSchema } from "@/lib/validation/common";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminUser();
    const { id: sessionId } = await params;
    idParamSchema.parse(sessionId);
    const db = createAdminClient();

    // "Nhật ký thao tác" phải gộp CẢ 2 nguồn: session_events (tải đề, chọn
    // đáp án, mất mạng...) VÀ violation_logs (vi phạm giám sát) — trước đây
    // chỉ đọc session_events nên vi phạm dẫn tới auto-submit không hề xuất
    // hiện trong timeline, khiến admin không thấy lý do thực sự bị cắt bài.
    const [eventsRes, violationsRes] = await Promise.all([
      db
        .from("session_events")
        .select("id, type, payload, client_time, created_at")
        .eq("session_id", sessionId),
      db
        .from("violation_logs")
        .select("id, type, created_at, dismissed")
        .eq("session_id", sessionId),
    ]);
    if (eventsRes.error) throw eventsRes.error;
    if (violationsRes.error) throw violationsRes.error;

    const violationEvents = (violationsRes.data ?? []).map((v) => ({
      id: v.id,
      type: "violation",
      payload: { violation_type: v.type, dismissed: v.dismissed },
      client_time: null,
      created_at: v.created_at,
    }));

    const merged = [...(eventsRes.data ?? []), ...violationEvents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    return NextResponse.json({ events: merged });
  } catch (err) {
    return handleApiError(err);
  }
}
