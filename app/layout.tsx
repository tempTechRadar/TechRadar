import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "TechRadar",
  description: "내가 깐 AI 코딩 도구를 지키고, 고르고, 옮긴다",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "24px", lineHeight: 1.6 }}>
        {children}
      </body>
    </html>
  );
}
