import { LOCAL_PROJECT_NAME } from "@/lib/server/local-import";
import type { CatalogHit } from "@/lib/server/my-tech";
import { addTechAction } from "./tech-actions";
import type { ProjectRow } from "./tech-table";

// 기술 직접 추가(IA-3, PRD-F7): 모은 기술에서 검색해 고르거나, 없으면 이름만 쓴다(등급 "찾지 못함").
// 자바스크립트 없이 도는 일반 폼이다. 검색은 주소의 ?q=로 한다.
// back = 보던 화면(추가 뒤 돌아올 곳), carry = 검색해도 지우지 않을 거르기 상태(둘 다 keepView 글).
type Props = { projects: ProjectRow[]; q: string; hits: CatalogHit[] | null; searchFailed: boolean; back: string; carry: string };

function ProjectSelect({ projects }: { projects: ProjectRow[] }) {
  // "프로젝트 밖(내 컴퓨터)" 칸이 아직 없으면 고를 수 있게 하고, 고르면 그때 만든다
  const options: [string, string][] = projects.map((p) => [p.id, p.name]);
  if (!projects.some((p) => p.kind === "local")) options.push(["local", LOCAL_PROJECT_NAME]);
  return (
    <label>
      넣을 프로젝트
      <select name="projectId" required>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );
}

const ROW = { alignItems: "end" } as const;

const VersionInput = () => (
  <label className="search">
    버전(모르면 비워 두세요)
    <input name="version" maxLength={40} autoComplete="off" />
  </label>
);

export function AddTech({ projects, q, hits, searchFailed, back, carry }: Props) {
  return (
    <section className="card" aria-labelledby="add-title">
      <h2 id="add-title">기술 직접 추가</h2>
      <form method="get" action="/dashboard#add-title" className="filters" style={ROW}>{/* 찾은 뒤 보드 맨 위가 아니라 이 칸으로(P-12i D3: 프로젝트 관리 보드의 레포 관리 위젯 안) */}
        {[...new URLSearchParams(carry)].map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
        <label className="search">
          모은 기술에서 찾기(두 글자 이상)
          <input name="q" defaultValue={q} autoComplete="off" />
        </label>
        <button className="btn" type="submit">찾기</button>
      </form>
      {searchFailed ? (
        <p className="notice notice-error" role="alert">검색하지 못했어요(조회 실패). 잠시 뒤 다시 찾아 주세요.</p>
      ) : hits === null ? null : hits.length === 0 ? (
        <p className="muted">찾은 기술이 없어요. 아래에서 이름만 써서 추가할 수 있어요.</p>
      ) : (
        <form action={addTechAction}>
          <input type="hidden" name="back" value={back} />
          <p className="muted">직접 추가한 기술은 아직 보안 확인이 붙지 않아 등급이 "찾지 못함"으로 보여요. 보안 경고는 저장소에서 읽은 기술부터 와요.</p>
          <fieldset>
            <legend>찾은 기술 중에서 고르기</legend>
            {hits.map((h) => (
              <div key={h.id}>
                <label>
                  <input type="radio" name="techId" value={h.id} required /> {h.display_name}
                  <span className="source">{h.type} · {h.tech_key}</span>
                </label>
              </div>
            ))}
          </fieldset>
          <div className="filters" style={ROW}>
            <ProjectSelect projects={projects} />
            <VersionInput />
          </div>
          <button className="btn btn-primary" type="submit">고른 기술 추가</button>
        </form>
      )}
      <h3>이름만 써서 추가</h3>
      <p className="muted">모은 기술에 없을 때 써요. 등급은 "찾지 못함"이 되고 보안 경고는 오지 않아요.</p>
      <form action={addTechAction}>
        <input type="hidden" name="back" value={back} />
        <div className="filters" style={ROW}>
          <label className="search">
            기술 이름
            <input name="name" required maxLength={80} autoComplete="off" />
          </label>
          <ProjectSelect projects={projects} />
          <VersionInput />
        </div>
        <button className="btn" type="submit">이름으로 추가</button>
      </form>
    </section>
  );
}
