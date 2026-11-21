// 보는 곳 줄 "지도 | 보드 | 일지"(11-21 사용자 결정 A): 지도 · 보드(/views) · 일지(/history) 세 화면 맨 위에 같은 줄. 주소는 그대로, 이름만 바꿈
import { NavLink } from "./nav-link";
import "./space-switch.css";

export function SpaceSwitch() {
  return (
    <nav aria-label="보는 곳" className="space-switch">
      <NavLink href="/">지도</NavLink>
      <NavLink href="/views">보드</NavLink>
      <NavLink href="/history">일지</NavLink>
    </nav>
  );
}
