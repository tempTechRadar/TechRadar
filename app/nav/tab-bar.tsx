// 휴대폰 아래 탭 바(11-21 사용자 결정, 화면 개편 A: 지도 · 보드 · 일지 · 청사진): 좁은 화면에서는 보는 곳 메뉴를 아래로(엄지가 닿는 곳). 넓은 화면에서는 숨김(위 메뉴와 같은 링크)
import type { ReactNode } from "react";
import { NavLink } from "./nav-link";

const I = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICON = {
  map: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  blueprint: "M4 4h16v16H4zM4 9h16M9 9v11",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
};

/** cart = 청사진 담은 수 배지(레이아웃이 만든 CartBadge) */
export function TabBar({ cart }: { cart?: ReactNode }) {
  return (
    <nav aria-label="아래 메뉴" className="tab-bar">
      <NavLink href="/dashboard" also={["/history"]}><I d={ICON.history} />현황</NavLink>
      <NavLink href="/"><I d={ICON.map} />지도</NavLink>
      <NavLink href="/blueprint"><I d={ICON.blueprint} /><span>청사진{cart}</span></NavLink>
      <NavLink href="/alerts"><I d={ICON.bell} />알림</NavLink>
    </nav>
  );
}
