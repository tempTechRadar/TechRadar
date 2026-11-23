import { restoreProjectAction } from "./project-actions";
import type { ArchivedRepo } from "@/lib/server/repo-detail";

// 보관함(PRD-F4, P-12k K2): 보드 "진행 중 프로젝트" 판 아래 작은 펼치기. 지우지 않았으니 여기서 되살린다.
// projects = null: 못 읽음 → "없다"가 아니라 "불러오지 못했다"(불변 2). 비었으면 그리지 않는다.
const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

export function ArchivedProjects({ projects }: { projects: ArchivedRepo[] | null }) {
  if (projects === null) return <p className="board-fail" role="status">— 보관함을 읽지 못했어요(없다는 뜻이 아니에요).</p>;
  if (projects.length === 0) return null;
  return (
    <details className="archive-box">
      <summary>보관함 {projects.length}</summary>
      <p className="muted">보드 · 지도 · 알림에서 빠져 있어요. 되살리면 다시 보이고, 최신 상태는 레포 상세의 &quot;다시 읽기&quot;로 맞춰요.</p>
      <ul className="board-lines">{projects.map((p) => (
        <li key={p.id}><span className="board-src">{day.format(new Date(p.archived_at))} 보관</span><span>{p.name}</span>
          <form action={restoreProjectAction}><input type="hidden" name="id" value={p.id} /><button className="btn btn-sm" type="submit" aria-label={`${p.name} 되살리기`}>되살리기</button></form></li>
      ))}</ul>
    </details>
  );
}
