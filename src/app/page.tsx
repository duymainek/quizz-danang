import { redirect } from "next/navigation";

// Trang chủ là nơi thí sinh vào thi (đối tượng người dùng chính, truy cập
// qua điện thoại). Admin/giám thị vào bằng đường dẫn riêng /login hoặc /admin.
export default function RootPage() {
  redirect("/exam");
}
