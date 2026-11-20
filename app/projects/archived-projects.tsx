import { koreanTime } from "@/lib/flow/run-list";
import { restoreProjectAction } from "./project-actions";

// 보관한 프로젝트(PRD-F4). 지우지 않았으니 여기서 되살릴 수 있다. 못 읽었으면 "없다"가 아니라 "불러오지 못했다"로 보인다(불변 2).
export type ArchivedProject = { id: string; name: string; repo_url: string | null; archived_at: string };

export function ArchivedProjects({ projects, failed }: { projects: ArchivedProject[]; failed: boolean }) {
  if (failed) {
    return (
      <section className="card" aria-labelledby="p-archived">
        <h2 id="p-archived">보관한 프로젝트</h2>
        <p className="notice notice-error" role="status">보관한 프로젝트를 불러오지 못했어요(없다는 뜻이 아니에요). 잠시 뒤 새로 고쳐 주세요.</p>
      </section>
    );
  }
  if (projects.length === 0) return null;
  return (
    <section className="card" aria-labelledby="p-archived">
      <h2 id="p-archived">보관한 프로젝트</h2>
      <p className="muted">내 기술 목록·지도·알림에서 빠져 있어요. 지우지 않았어요. 되살리면 다시 보이고, 최신 상태는 '다시 읽기'로 맞춰요.</p>
      <ul>
        {projects.map((p) => (
          <li key={p.id}>
            <strong>{p.name}</strong>{" "}
            <span className="muted">{p.repo_url} · {koreanTime(p.archived_at)}에 보관</span>
            <form action={restoreProjectAction} style={{ display: "inline", marginLeft: "12px" }}>
              <input type="hidden" name="id" value={p.id} />
              <button className="btn" type="submit" aria-label={`${p.name} 되살리기`}>되살리기</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
