# Đề xuất redesign UX/UI: Landing page, luồng thí sinh theo mã cá nhân, và IA cho Admin

## 1. Tham khảo thị trường (case study)

Vài mẫu hình phổ biến trong các nền tảng thi trắc nghiệm/thi chứng chỉ online:

- **Pearson VUE / Prometric (thi chứng chỉ chuyên nghiệp):** luồng gồm 3 bước rõ ràng — (1) trang xác thực danh tính (candidate ID), (2) màn hình "Exam Rules Acknowledgement" bắt buộc tick từng điều khoản trước khi Start, (3) danh sách các kỳ thi được gán cho thí sinh đó, mỗi kỳ có trạng thái (Available / Not yet available / Completed). Thí sinh không tự "chọn đề thi mở" — hệ thống chỉ hiện đề đã được gán cho họ.
- **Google Forms Quiz / Kahoot (thi phổ thông, nhẹ):** vào thẳng bằng mã phòng (room code) hoặc link, không có khái niệm tài khoản/lịch sử — phù hợp thi 1 lần, không cần tra cứu lại.
- **TOEFL iBT Home Edition:** có màn hình "System & Room Check" trước khi vào phòng chờ, tách bạch rõ 3 trạng thái: Trước giờ thi (rules + check) → Trong phòng chờ (đếm ngược, xác nhận danh tính) → Trong bài thi.
- **LMS thi nội bộ doanh nghiệp (Coursera for Business, TalentLMS):** thí sinh đăng nhập 1 lần bằng mã nhân viên/mã học viên → thấy "My Assessments" gồm tất cả bài thi được giao, trạng thái Chưa mở / Đang mở / Đã hoàn thành / Hết hạn, cộng lịch sử điểm.

**Điểm chung rút ra và áp dụng được cho hệ thống của bạn:**
1. Tách bạch 2 khái niệm: **identity của thí sinh** (ai đang thi) và **exam instance** (đề nào, cho ai). Không nên gộp "mã thi" = "mã định danh" như hiện tại.
2. Luôn có màn hình quy chế/rules **trước khi** thí sinh được phép chọn đề hoặc vào phòng chờ, và yêu cầu tick xác nhận đã đọc (giữ log timestamp xác nhận — hữu ích nếu sau này có tranh chấp).
3. Trạng thái "đề chưa mở" nên hiển thị nhưng **disabled/greyed**, không ẩn đi — thí sinh biết đề tồn tại nhưng chưa đến giờ, tránh nhầm lẫn "sao không thấy đề của mình".
4. Có nơi tra cứu lịch sử (đã thi đề nào, khi nào, kết quả) — tăng niềm tin và giảm số lượt hỏi admin "em thi rồi mà sao không thấy điểm".

## 2. Vấn đề với model hiện tại

Hiện tại `student_codes` là bảng **per-exam**: 1 dòng = 1 mã, buộc vào đúng 1 `exam_id` (`UNIQUE(exam_id, code)`). Điều này nghĩa là:
- Một thí sinh thi 2 đề sẽ có 2 mã khác nhau (hoặc trùng text nhưng là 2 record độc lập, không liên kết).
- Không có khái niệm "thí sinh" xuyên suốt để tra cứu lịch sử nhiều đề cùng lúc.
- Trang `/exam` hiện tại chỉ là nơi *chọn đề trước, nhập mã sau* — đúng hướng nhưng chưa có landing/rules, và mã vẫn gắn chặt vào 1 đề.

Để làm đúng yêu cầu "1 thí sinh — 1 mã — thấy toàn bộ lịch sử và danh mục đề", cần thêm 1 tầng identity mới.

## 3. Đề xuất schema

```
students (MỚI)
  id uuid pk
  code text unique              -- mã cá nhân, thí sinh dùng mã này để đăng nhập
  full_name text
  created_at timestamptz

exam_assignments (MỚI, thay thế phần "who can take this exam" của student_codes)
  id uuid pk
  exam_id uuid fk -> exams
  student_id uuid fk -> students
  status text  -- unused | in_progress | submitted | reset
  unique(exam_id, student_id)

exam_sessions
  ... giữ nguyên, nhưng FK đổi từ student_code_id -> exam_assignment_id
```

- Sinh mã hàng loạt (US-05) giờ sinh ra **students**, sau đó admin **gán** (assign) students vào 1 hoặc nhiều exam — hoặc đơn giản hơn: khi tạo đề, admin import lại đúng danh sách mã đã có sẵn (chọn từ danh sách students hiện có + option tạo mới).
- Đây là thay đổi schema tương đối lớn, nên làm ở migration riêng, có kế hoạch di trú dữ liệu cũ (mỗi `student_codes` hiện tại → tạo 1 `students` + 1 `exam_assignments` tương ứng).

## 4. Luồng thí sinh đề xuất (redesign)

```
/                       → redirect /landing
/landing                → Trang giới thiệu + quy chế dự thi (KHÔNG cần mã để xem)
                          - Giới thiệu ngắn về kỳ thi/nền tảng
                          - Quy chế: cấm chuyển tab, cấm mở tab khác, số lần vi phạm tối đa,
                            thời gian làm bài, chính sách nộp bài tự động khi hết giờ
                          - Checkbox "Tôi đã đọc và đồng ý quy chế" (bắt buộc)
                          - Nút "Tiếp tục" → /portal

/portal                 → Nhập mã cá nhân (1 ô input, không cần chọn đề trước)
                          - POST /api/student/login {code}
                          - Trả về student profile + toàn bộ exam_assignments

/portal/[studentId]      (lưu session qua cookie, không cần lặp lại mã mỗi lần)
                          → "Đề thi của tôi": danh sách card
                            - Đề đang mở, chưa làm     → nút "Vào thi" (màu chính)
                            - Đề đang mở, đang làm dở  → nút "Tiếp tục làm bài"
                            - Đề đang mở, đã nộp       → nút "Xem kết quả" (nếu admin cho phép)
                            - Đề CHƯA mở (is_active=false) → card GREYED, badge "Chưa mở",
                              không click được, có thể hiện "dự kiến mở lúc..." nếu có field đó
                          → Có thể thêm tab "Lịch sử" tổng hợp tất cả lượt đã nộp + điểm

/portal/exam/[examId]/wait  → giữ logic phòng chờ hiện tại (đếm ngược, xác nhận danh tính)
/portal/exam/[examId]/take  → giữ luồng làm bài hiện tại
/portal/exam/[examId]/done  → giữ màn hình xác nhận nộp bài
```

**Về quy chế/rules:** nên tách landing (xem quy chế, không cần mã) ra khỏi portal (cần mã), vì quy chế là thông tin công khai — thí sinh có thể xem trước khi có mã trong tay, còn portal là khu vực đã xác thực.

**Việc bắt buộc tick "đã đọc quy chế"**: lưu 1 dòng vào `session_events` (loại `rules_acknowledged`, có timestamp) khi thí sinh bấm tiếp tục — tái dùng cơ chế silent-log đã có sẵn, không cần bảng mới.

## 5. Đề xuất thiết kế theo shadcn/ui

### Trang thí sinh (mobile-first)
- `Card` cho từng đề thi trong `/portal` — dùng `Badge` cho trạng thái (Đang mở = variant "default"/emerald, Chưa mở = variant "secondary"/xám, Đã nộp = variant "outline").
- `Checkbox` + `Button` (disabled cho đến khi tick) cho màn hình quy chế ở `/landing`.
- `AlertDialog` (không phải `confirm()` gốc trình duyệt — đã tránh vì trigger anti-cheat sai) cho xác nhận nộp bài — đã làm đúng hướng này rồi, giữ nguyên pattern.
- `Progress` hoặc `Badge` đếm số câu đã trả lời trong thanh điều hướng câu hỏi khi làm bài.
- `Skeleton` cho trạng thái loading danh sách đề, tránh layout giật khi fetch xong.

### Trang admin (desktop, cần "phân rã" lại IA)
Hiện tại admin đang phẳng theo dạng "Subjects → Pools → Questions" và "Exams → (sub-pages rời rạc)". Đề xuất tổ chức lại theo **shadcn dashboard layout chuẩn** (`Sidebar` + `SidebarProvider` từ shadcn, pattern giống các dashboard block phổ biến):

```
Sidebar (trái, persistent, collapsible)
├── Tổng quan (Dashboard)          -- số liệu nhanh: đề đang mở, thí sinh đang thi, vi phạm hôm nay
├── Ngân hàng câu hỏi
│   ├── Môn học (Subjects)
│   └── Tệp câu hỏi (Pools)         -- gộp 2 khái niệm hiện đang tách rời khó tìm
├── Đề thi (Exams)
│   ├── Danh sách đề
│   └── [Chi tiết 1 đề] → dùng Tabs thay vì các trang con rời:
│         Tab "Cấu hình"    (form sửa đề, scoring mode...)
│         Tab "Mã thí sinh" (danh sách mã, batch tạo, export)
│         Tab "Giám sát"    (dashboard realtime)
│         Tab "Kết quả"     (bảng điểm, export, chi tiết từng bài)
└── Cài đặt (Settings)              -- tài khoản admin, sau này có thể mở rộng
```

Lý do gộp bằng `Tabs` thay vì route con rời rạc: hiện tại 1 đề thi có tới 4 trang riêng biệt (`/dashboard`, `/codes`, `/results`, và trang chi tiết) khiến admin phải nhớ đường link, mất ngữ cảnh "đang xem đề nào" mỗi khi chuyển trang. Dùng `Tabs` của shadcn giữ nguyên URL cha `/admin/exams/[id]` với query param `?tab=`, header (tên đề + badge active/inactive + nút mở/đóng) luôn cố định phía trên, chỉ nội dung tab thay đổi — giảm số lần load lại toàn trang và giữ ngữ cảnh.

Các components shadcn nên bổ sung dần: `Sidebar`, `Tabs`, `DataTable` (kết hợp `@tanstack/react-table`) cho các bảng mã số/kết quả hiện đang là `<table>` thuần, `Command` (cmd+k) để admin tìm nhanh đề/thí sinh khi số lượng lớn dần.

## 6. Đề xuất triển khai theo giai đoạn

1. **Giai đoạn 1 (không đổi schema):** thêm `/landing` với quy chế + checkbox, giữ nguyên model per-exam-code hiện tại. Nhanh, không rủi ro dữ liệu.
2. **Giai đoạn 2 (đổi schema):** tách `students` khỏi `student_codes`/`exam_assignments`, dựng `/portal` theo mã cá nhân xuyên suốt nhiều đề + lịch sử. Cần migration dữ liệu cẩn thận vì đang có dữ liệu thật.
3. **Giai đoạn 3 (design system):** đưa shadcn/ui vào (`npx shadcn init`), refactor dần từng trang admin sang `Sidebar` + `Tabs` + `DataTable`, và trang thí sinh sang `Card`/`Badge`/`AlertDialog` đã liệt kê ở trên.

## 7. Câu hỏi cần bạn quyết định trước khi code

- Có đồng ý đổi sang model "1 mã cá nhân dùng cho nhiều đề" (giai đoạn 2) hay giữ "mỗi đề 1 mã riêng" và chỉ thêm landing/rules (giai đoạn 1) trước, làm giai đoạn 2 sau?
- Quy chế dự thi cụ thể là gì (số lần chuyển tab tối đa, có cấm dùng điện thoại khác quay màn hình không, chính sách với thí sinh mất mạng giữa chừng...) — để viết nội dung trang `/landing` chính xác thay vì placeholder chung chung?
- Có cần thí sinh xem lại chi tiết đáp án sau khi nộp (đúng/sai từng câu) hay chỉ xem điểm tổng — ảnh hưởng tab "Lịch sử" ở `/portal`?
