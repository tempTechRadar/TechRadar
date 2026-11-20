import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { CaptureDialog } from "@/app/capture/capture-dialog";
import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user";
import "./tokens.css";
import "./site-nav.css";

export const metadata: Metadata = {
  title: "TechRadar",
  description: "내가 깐 AI 코딩 도구를 지키고, 고르고, 옮긴다",
};

// 메뉴가 profiles를 못 읽어도 화면 전체가 깨지면 안 된다: 로그를 남기고 undefined(모름)를 돌려준다.
// 모를 때는 내 것 메뉴를 그대로 보인다(각 화면은 따로 권한을 본다). null은 로그인 안 함이 확실할 때만
async function menuUser(): Promise<CurrentUser | null | undefined> {
  try {
    return await getCurrentUser();
  } catch (error) {
    unstable_rethrow(error); // 정적 렌더 중단·redirect 같은 Next 신호는 오류가 아니다
    console.error("메뉴: 로그인한 사람을 읽지 못함", error instanceof Error ? error.message : error);
    return undefined;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await menuUser();
  return (
    <html lang="ko">
      <body>
        {/* 메뉴(design.md 13절 1): 왼쪽은 보는 곳, 오른쪽은 내 것. 대시보드·비교는 내 레이더(/views) 위 링크로 간다.
            로그인 전에는 기술 지도만(나머지는 로그인이 필요). "+ 기술 넣기"는 대화상자(못 찾으면 내 프로젝트의 직접 추가로) */}
        <nav aria-label="주 메뉴" className="site-nav">
          <div className="site-nav-main">
            <Link href="/">기술 지도</Link>
            {user !== null ? (
              <>
                <Link href="/new">새 기술</Link>
                <Link href="/recommend">추천</Link>
                <Link href="/views">내 레이더</Link>
                <Link href="/alerts">알림</Link>
                <Link href="/history">기록</Link>
              </>
            ) : null}
          </div>
          <div className="site-nav-side">
            {user !== null ? (
              <>
                <CaptureDialog />
                <Link href="/projects">내 프로젝트</Link>
                <Link href="/settings">설정</Link>
              </>
            ) : null}
            {user?.role === "admin" ? <Link href="/admin">관리자</Link> : null}
            {user ? (
              <form action={signOut}>
                <span>{user.nickname ? `${user.nickname}님` : "내 계정"}</span>
                <button type="submit">로그아웃</button>
              </form>
            ) : (
              <Link href="/login">로그인</Link>
            )}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
