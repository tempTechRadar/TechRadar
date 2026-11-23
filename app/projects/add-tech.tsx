import { LOCAL_PROJECT_NAME } from "@/lib/server/local-import";
import type { CatalogHit } from "@/lib/server/my-tech";
import { addTechAction } from "./tech-actions";

// 기술 직접 추가(IA-3, PRD-F7, 안내서 필수 "직접 입력"): 모은 기술에서 검색해 고르거나, 없으면 이름만 쓴다(등급 "찾지 못함").
// 프로젝트 관리 보드의 "직접 추가" 판 본문(P-12k K1 컴팩트: 판 제목이 h2라 여기엔 제목 · 카드가 없다). 자바스크립트 없이 도는 일반 폼이고, 검색은 주소의 ?q=로 한다.
// back = 보던 화면(추가 뒤 돌아올 곳), carry = 검색해도 지우지 않을 거르기 상태(둘 다 keepView 글).
type Props = { projects: { id: string; name: string; kind: "repo" | "local" }[]; q: string; hits: CatalogHit[] | null; searchFailed: boolean; back: string; carry: string };

function ProjectSelect({ projects }: { projects: Props["projects"] }) {
  // "프로젝트 밖(내 컴퓨터)" 칸이 아직 없으면 고를 수 있게 하고, 고르면 그때 만든다
  const options: [string, string][] = projects.map((p) => [p.id, p.name]);
  if (!projects.some((p) => p.kind === "local")) options.push(["local", LOCAL_PROJECT_NAME]);
  return (
    <label>
      넣을 레포
      <select name="projectId" required>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

const VersionInput = () => <label>버전(모르면 비움) <input name="version" maxLength={40} autoComplete="off" size={8} /></label>;

export function AddTech({ projects, q, hits, searchFailed, back, carry }: Props) {
  return (
    <div className="add-tech">
      <form method="get" action="/dashboard#w-add" className="add-row" role="search">{/* 찾은 뒤 보드 맨 위가 아니라 이 판으로 */}
        {[...new URLSearchParams(carry)].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <label>모은 기술에서 찾기 <input name="q" defaultValue={q} autoComplete="off" placeholder="두 글자 이상" /></label>
        <button className="btn btn-sm" type="submit">찾기</button>
      </form>
      {searchFailed ? (
        <p className="board-fail" role="alert">— 검색하지 못했어요(조회 실패). 찾은 것이 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</p>
      ) : hits === null ? null : hits.length === 0 ? (
        <p className="board-empty">찾은 기술이 없어요. 아래에 이름만 써서 넣을 수 있어요.</p>
      ) : (
        <form action={addTechAction} className="add-hits">
          <input type="hidden" name="back" value={back} />
          <fieldset>
            <legend>찾은 기술 중에서 고르기</legend>
            {hits.map((h) => (
              <label key={h.id}><input type="radio" name="techId" value={h.id} required /> {h.display_name} <span className="muted">{h.type} · {h.tech_key}</span></label>
            ))}
          </fieldset>
          <div className="add-row"><ProjectSelect projects={projects} /><VersionInput /><button className="btn btn-sm btn-primary" type="submit">고른 기술 넣기</button></div>
        </form>
      )}
      <form action={addTechAction} className="add-row">
        <input type="hidden" name="back" value={back} />
        <label>이름만 <input name="name" required maxLength={80} autoComplete="off" /></label>
        <ProjectSelect projects={projects} />
        <VersionInput />
        <button className="btn btn-sm" type="submit">이름으로 넣기</button>
      </form>
      <p className="muted">직접 넣은 항목은 아직 보안 확인이 붙지 않아 등급이 &quot;찾지 못함&quot;이고 보안 경고가 오지 않아요.</p>
    </div>
  );
}
