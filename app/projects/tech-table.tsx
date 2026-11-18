import Link from "next/link";
import type { Grade } from "@/lib/domain/grade";
import { filterTechs, GRADE_LABEL, GRADE_TONE, ORIGIN_LABEL, type TechFilter } from "@/lib/domain/my-tech-view";
import { koreanTime } from "@/lib/flow/run-list";
import { registerProject } from "./actions";
import { toggleHidden } from "./tech-actions";

// 프로젝트별 내 기술 표(IA-3). 등급은 내 버전 기준(my_technologies), 카탈로그(technologies) 등급이 아니다(erd 2.2).
export type MyTech = {
  id: string; origin: string; version: string | null; source_file: string | null; manual_name: string | null; hidden_at: string | null;
  read_at: string | null; collect_error_kind: string | null; grade: Grade; grade_reason: string | null; last_checked_ok_at: string | null;
  technologies: { tech_key: string; display_name: string } | null;
};
export type ProjectRow = { id: string; name: string; kind: "repo" | "local"; repo_url: string | null; my_technologies: MyTech[] };

/** back = 보던 화면(keepView 글). 숨기기·되돌리기 뒤에 같은 화면으로 돌아오게 폼에 싣는다. */
export function ProjectTechs({ project, filter, back }: { project: ProjectRow; filter: TechFilter; back: string }) {
  const shown = filterTechs(project.my_technologies, filter);
  const hiddenCount = project.my_technologies.filter((m) => m.hidden_at).length;
  return (
    <section className="card" aria-labelledby={`p-${project.id}`}>
      <h2 id={`p-${project.id}`}>{project.name}</h2>
      {project.repo_url && (
        <div className="muted">
          {project.repo_url}
          {/* 같은 주소로 등록하면 다시 읽기가 된다(registerAndRead) */}
          <form action={registerProject} style={{ display: "inline", marginLeft: "12px" }}>
            <input type="hidden" name="repoUrl" value={project.repo_url} />
            <button className="btn" type="submit">다시 읽기</button>
          </form>
        </div>
      )}
      {hiddenCount > 0 && !filter.showHidden && <p className="muted">숨긴 기술 {hiddenCount}개는 목록에서 뺐어요. '숨긴 기술도 보기'를 켜면 되돌릴 수 있어요.</p>}
      {shown.length === 0 ? <p>{project.my_technologies.length === 0 ? "읽은 AI 코딩 도구가 없어요." : "고른 조건에 맞는 기술이 없어요."}</p> : <TechTable techs={shown} back={back} />}
    </section>
  );
}

function TechTable({ techs, back }: { techs: MyTech[]; back: string }) {
  return (
    <table className="compare">
      <thead>
        <tr>
          <th scope="col">기술</th>
          <th scope="col">등급</th>
          <th scope="col">이유</th>
          <th scope="col">출처</th>
          <th scope="col">바꾸기</th>
        </tr>
      </thead>
      <tbody>{techs.map((m) => <TechRow key={m.id} m={m} back={back} />)}</tbody>
    </table>
  );
}

function TechRow({ m, back }: { m: MyTech; back: string }) {
  const name = m.technologies?.display_name ?? m.manual_name ?? "(이름 없음)";
  const checked = m.last_checked_ok_at ? koreanTime(m.last_checked_ok_at) : "없음";
  const action = m.hidden_at ? "되돌리기" : "숨기기";
  return (
    <tr>
      <th scope="row">
        <Link href={`/projects/tech/${m.id}`}>{name}</Link>
        <span className="source">버전 {m.version ?? "모름"}</span>
      </th>
      <td data-label="등급">
        <span className={`badge badge-${GRADE_TONE[m.grade]}`}>{GRADE_LABEL[m.grade]}</span>
        {m.collect_error_kind && (
          <>
            {" "}
            <span className="badge badge-warning">수집 오류</span>
            <span className="source">마지막 확인 {checked}</span>
          </>
        )}
      </td>
      <td data-label="이유">{m.grade_reason ?? "확인할 수 있는 자료를 찾지 못했어요"}</td>
      <td data-label="출처">
        {ORIGIN_LABEL[m.origin] ?? m.origin}
        {m.source_file && <span className="source">{m.source_file}</span>}
        {m.read_at && <span className="source">읽은 시각 {koreanTime(m.read_at)}</span>}
        {m.hidden_at && <span className="badge badge-neutral">직접 숨김</span>}
      </td>
      <td data-label="바꾸기">
        <form action={toggleHidden}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="hide" value={m.hidden_at ? "0" : "1"} />
          <input type="hidden" name="back" value={back} />
          <button className="btn" type="submit" aria-label={`${name} ${action}`} style={{ whiteSpace: "nowrap" }}>{action}</button>
        </form>
      </td>
    </tr>
  );
}
