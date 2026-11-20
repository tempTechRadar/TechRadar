// 휴대폰 아래 탭 바(11-21 사용자 결정): 좁은 화면에서는 보는 곳 메뉴를 아래로(엄지가 닿는 곳). 넓은 화면에서는 숨김(위 메뉴와 같은 링크)
import { NavLink } from "./nav-link";

const I = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICON = {
  map: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6",
  new: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  radar: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
};

export function TabBar() {
  return (
    <nav aria-label="아래 메뉴" className="tab-bar">
      <NavLink href="/"><I d={ICON.map} />지도</NavLink>
      <NavLink href="/new"><I d={ICON.new} />새 기술</NavLink>
      <NavLink href="/views"><I d={ICON.radar} />내 레이더</NavLink>
      <NavLink href="/history"><I d={ICON.history} />기록</NavLink>
    </nav>
  );
}
