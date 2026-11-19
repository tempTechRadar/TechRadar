import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user";
import "./site-nav.css";

export const metadata: Metadata = {
  title: "TechRadar",
  description: "내가 깐 AI 코딩 도구를 지키고, 고르고, 옮긴다",
};

// 메뉴가 profiles를 못 읽어도 화면 전체가 깨지면 안 된다: 로그를 남기고 로그인 전처럼 보인다(각 화면은 따로 권한을 본다)
async function menuUser(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error); // 정적 렌더 중단·redirect 같은 Next 신호는 오류가 아니다
    console.error("메뉴: 로그인한 사람을 읽지 못함", error instanceof Error ? error.message : error);
    return null;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await menuUser();
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "24px", lineHeight: 1.6 }}>
        {/* 메뉴 자리: 조각마다 자기 화면 링크 한 줄을 여기에 더한다(등록 P-3, 알림 P-7, 관리자 P-6) */}
        <nav aria-label="주 메뉴" className="site-nav">
          <Link href="/">처음</Link>
          <Link href="/projects">내 프로젝트</Link>
          <Link href="/alerts">알림</Link>
          <Link href="/dashboard">대시보드</Link>
          <Link href="/history">기록</Link>
          <Link href="/compare">비교</Link>
          <Link href="/settings">설정</Link>
          {user ? (
            <form action={signOut}>
              <span>{user.nickname ? `${user.nickname}님` : "내 계정"}</span>
              <button type="submit">로그아웃</button>
            </form>
          ) : (
            <Link href="/login">로그인</Link>
          )}
          <Link href="/admin">관리자</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
