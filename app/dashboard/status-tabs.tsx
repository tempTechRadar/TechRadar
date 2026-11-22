// 현황 탭 줄(P-12f ④): 개요 | 일지 | 소식. 개요 = /dashboard, 일지 = /history(주소 유지), 소식 = /dashboard?tab=news. 지금 탭은 화면이 알려 준다(서버 조각)
import Link from "next/link";
import "./status.css";

export type StatusTab = "overview" | "journal" | "news";
const TABS: [StatusTab, string, string][] = [["overview", "개요", "/dashboard"], ["journal", "일지", "/history"], ["news", "소식", "/dashboard?tab=news"]];

export function StatusTabs({ now }: { now: StatusTab }) {
  return (
    <nav aria-label="프로젝트 관리 보기" className="status-tabs">
      {TABS.map(([k, name, href]) => <Link key={k} href={href} aria-current={k === now ? "page" : undefined}>{name}</Link>)}
    </nav>
  );
}
