import { redirect } from "next/navigation";

// Trang chọn đề dạng cũ đã gộp vào /portal (danh sách đề theo mã cá nhân).
export default function ExamPickerRedirect() {
  redirect("/portal");
}
