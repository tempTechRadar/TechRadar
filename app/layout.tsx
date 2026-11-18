import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "TechRadar",
  description: "내가 깐 AI 코딩 도구를 지키고, 고르고, 옮긴다",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "24px", lineHeight: 1.6 }}>
        {/* 메뉴 자리: 조각마다 자기 화면 링크 한 줄을 여기에 더한다(등록 P-3, 알림 P-7, 관리자 P-6) */}
        <nav aria-label="주 메뉴" style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
          <Link href="/">처음</Link>
          <Link href="/projects">내 프로젝트</Link>
          <Link href="/login">로그인</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
