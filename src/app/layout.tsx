import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});


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
    <html lang="vi" className={cn("h-full antialiased", "font-sans", inter.variable)}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
