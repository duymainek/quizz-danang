import { z } from "zod";

export const examEntrySchema = z.object({
  exam_id: z.string().uuid("Đề thi không hợp lệ"),
});

export const answerSchema = z.object({
  question_id: z.string().uuid("question_id không hợp lệ"),
  selected_options: z.array(z.number().int().min(0)),
});

export const violationSchema = z.object({
  type: z.enum([
    "tab_hidden",
    "window_blur",
    "fullscreen_exit",
    "copy_paste",
    "beforeunload",
  ]),
});

export const eventTypeSchema = z.enum([
  "session_loaded",
  "answer_first_select",
  "answer_change",
  "answer_save_failed",
  "answer_save_recovered",
  "submit_attempt",
  "submit_success",
  "submit_error",
  "network_offline",
  "network_online",
]);

export const eventSchema = z.object({
  type: eventTypeSchema,
  payload: z.record(z.string(), z.unknown()).optional().default({}),
  client_time: z.string().datetime().optional(),
});
