import type { Metadata } from "next";
import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { AccountMenu } from "@/app/account-menu";
import { LoginLink } from "@/app/login-link";
import { AlertBell } from "@/app/nav/alert-bell";
import { CartBadge } from "@/app/nav/cart-badge";
import { NavLink } from "@/app/nav/nav-link";
import { ScanStatusLine } from "@/app/nav/scan-status";
import { TabBar } from "@/app/nav/tab-bar";
import { LoginPreviewToggle } from "@/app/dev/login-preview-toggle";
import { isPreviewUser, loginPreviewAllowed } from "@/lib/dev/login-preview";
import { SAMPLE_RECENT } from "@/lib/dev/preview-data";
import { getCurrentUser, type CurrentUser } from "@/lib/server/current-user";
import { countCandidates } from "@/lib/server/marks";
import { getServerSupabase } from "@/lib/supabase/server";
import "./tokens.css";
import "./page.css"; // 공용 페이지 틀: 화면마다 다시 불러오지 않는다(P-12f ④)
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
  const pending = isPreviewUser(user) ? SAMPLE_RECENT.pending : user ? await pendingCount(user.id).catch((e) => { unstable_rethrow(e); return null; }) : null;
  // 청사진에 담은 수(P-12h U1). 손님은 브라우저가 센다. 미리보기 · 못 읽음 · 로그인 모름(undefined)은 null = 배지 없음(불변 2)
  const db = user && !isPreviewUser(user) ? await getServerSupabase() : null;
  const cart = user && db ? await countCandidates(db, user.id).catch((e) => { unstable_rethrow(e); return null; }) : null;
  const cartBadge = <CartBadge initial={cart} login={user !== null} />;
  return (
    <html lang="ko">
      <body>
        {/* 메뉴(design.md 13절 1, 11-21 사용자 결정 "같은 메뉴 + 계정 묶기" → "종 알림 · 아바타 · 지금 화면 표시"): 로그인 전후 가운데 메뉴는 똑같이 보이고,
            로그인이 필요한 화면은 누르면 그 자리에서 무엇이 열리는지 + 로그인(LoginNeeded). 왼쪽 로고 = 기술 지도.
            알림은 글자 메뉴에서 빼 오른쪽 종으로(배지 = 판단 대기), 내 프로젝트 · 설정 · 관리자 · 로그아웃은 아바타 펼침 하나로 */}
        <nav aria-label="주 메뉴" className="site-nav">
          <div className="site-nav-main">
            <NavLink href="/" className="site-nav-logo" label="TechRadar, 기술 지도">TechRadar</NavLink>
            {/* P-12f 사용자 결정: 프로젝트(지키고, P-12i 옛 "현황") · 지도(고르고) · 청사진(옮긴다). 일지(/history)는 프로젝트 관리의 탭이라 "프로젝트"가 현재 */}
            <NavLink href="/dashboard" also={["/history", "/projects"]}>프로젝트</NavLink>
            <NavLink href="/">지도</NavLink>
            <NavLink href="/blueprint">청사진{cartBadge}</NavLink>
          </div>
          <div className="site-nav-side">
            <ScanStatusLine admin={user?.role === "admin"} />
            <AlertBell pending={pending} login={user !== null} />
            {user !== null
              ? <AccountMenu name={user?.nickname ?? "내 계정"} admin={user?.role === "admin"} />
              : <LoginLink className="site-nav-login">로그인</LoginLink>}
          </div>
        </nav>
        {children}
        <TabBar cart={cartBadge} />
        {loginPreviewAllowed(process.env) ? <LoginPreviewToggle on={isPreviewUser(user)} /> : null}
      </body>
    </html>
  );
}
