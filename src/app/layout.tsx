import type { Metadata } from "next";
import "./globals.css";

// Dùng font hệ thống thay vì tải Google Fonts: nhẹ hơn, không phụ thuộc
// mạng ngoài lúc build/runtime — quan trọng cho exam-app chạy trên mobile
// mạng yếu (xem ui-ux-research.md).

export const metadata: Metadata = {
  title: "Hệ thống thi trắc nghiệm",
  description: "Nền tảng thi trắc nghiệm online",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
