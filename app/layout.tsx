import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { CaptureDialog } from "@/app/capture/capture-dialog";
import { ReadyGate } from "@/app/tech-map/ready-gate";
import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
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

/** 메뉴의 판단 대기 수(design.md 17절). 못 읽으면 null: 배지를 빼고(0으로 보이지 않게, 불변 2) 알림 화면이 따로 읽는다.
 *  shortcut: 화면 안 이동(링크)에서는 레이아웃이 다시 안 그려져 새로 고칠 때까지 옛 수일 수 있다. 바로 맞춰야 하면 판단 액션이 revalidatePath("/", "layout") */
async function pendingCount(userId: string): Promise<number | null> {
  const db = await getServerSupabase();
  const r = await db?.from("alerts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending");
  if (!r || r.error || r.count === null) { if (r?.error) console.error("메뉴: 판단 대기 수를 읽지 못함", r.error.message); return null; }
  return r.count;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await menuUser();
  const pending = user ? await pendingCount(user.id).catch((e) => { unstable_rethrow(e); return null; }) : null;
  return (
    <html lang="ko">
      <body>
        <ReadyGate />{/* 첫 화면 관문: 처음 열 때 한 번만 도는 스크립트(지도가 아니면 "이미 들어옴"만 남김) */}
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
                <Link href="/alerts" aria-label={pending ? `알림, 판단 대기 ${pending}건` : undefined}>알림{pending ? <span className="nav-badge" aria-hidden="true">{pending}</span> : null}</Link>
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
