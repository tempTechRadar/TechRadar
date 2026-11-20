import { RereadButton } from "./reread-button";
import Link from "next/link";
import type { Grade } from "@/lib/domain/grade";
import { filesOf, filterTechs, GRADE_TONE, gradeText, ORIGIN_LABEL, readStatusNotice, type ReadRun, type TechFilter } from "@/lib/domain/my-tech-view";
import { koreanTime } from "@/lib/flow/run-list";
import { registerProject } from "./actions";
import { toggleHidden } from "./tech-actions";

// 프로젝트별 내 기술 표(IA-3). 등급은 내 버전 기준(my_technologies), 카탈로그(technologies) 등급이 아니다(erd 2.2).
export type MyTech = {
  id: string; origin: string; version: string | null; source_file: string | null; manual_name: string | null; hidden_at: string | null;
  read_at: string | null; collect_error_kind: string | null; grade: Grade; grade_reason: string | null; last_checked_ok_at: string | null;
  technologies: { tech_key: string; display_name: string } | null;
};
// runs: 이 프로젝트의 읽기 실행들(RLS로 본인의 첫 읽기·다시 읽기만 보임). 마지막 읽기 상태 안내(readStatusNotice)에 쓴다. 빠지면 "읽은 기록 없음"으로 보인다.
export type ProjectRow = { id: string; name: string; kind: "repo" | "local"; repo_url: string | null; my_technologies: MyTech[]; runs?: ReadRun[] };

/** back = 보던 화면(keepView 글). 숨기기·되돌리기 뒤에 같은 화면으로 돌아오게 폼에 싣는다. */
export function ProjectTechs({ project, filter, back }: { project: ProjectRow; filter: TechFilter; back: string }) {
  const shown = filterTechs(project.my_technologies, filter);
  const hiddenCount = project.my_technologies.filter((m) => m.hidden_at).length;
  // 읽기가 끝까지 되지 않았으면 목록이 비었거나 일부여도 "없음"·"전부"라고 하지 않는다(불변 2)
  const notice = readStatusNotice(project.kind, project.runs, new Date());
  const emptyText = project.my_technologies.length > 0 ? "고른 조건에 맞는 기술이 없어요." : notice ? "" : "읽은 AI 코딩 도구가 없어요.";
  return (
    <section className="card" aria-labelledby={`p-${project.id}`}>
      <h2 id={`p-${project.id}`}>{project.name}</h2>
      {project.repo_url && (
        <div className="muted">
          {project.repo_url}
          {/* 같은 주소로 등록하면 다시 읽기가 된다(registerAndRead) */}
          <form action={registerProject} style={{ display: "inline", marginLeft: "12px" }}>
            <input type="hidden" name="repoUrl" value={project.repo_url} />
            <RereadButton />
          </form>
        </div>
      )}
      {notice && <p className="notice notice-error" role="status">{notice}</p>}
      {hiddenCount > 0 && !filter.showHidden && <p className="muted">숨긴 기술 {hiddenCount}개는 목록에서 뺐어요. '숨긴 기술도 보기'를 켜면 되돌릴 수 있어요.</p>}
      {shown.length === 0 ? (emptyText && <p>{emptyText}</p>) : <TechTable techs={shown} back={back} />}
      {project.kind === "repo" ? <ReadFiles techs={project.my_technologies} notice={notice} /> : null}
    </section>
  );
}

/** 읽은 결과를 파일마다(design.md 18절). 확인에 실패한 기술이 있거나 마지막 읽기가 끝까지 되지 않았으면 펼쳐 두고 왜 펼쳤는지 적는다 */
function ReadFiles({ techs, notice }: { techs: MyTech[]; notice: string | null }) {
  const files = filesOf(techs);
  const bad = files.filter((f) => f.errors).length;
  if (!files.length && !notice) return null;
  return (
    <details className="read-files" open={bad > 0 || !!notice}>
      <summary>기술이 나온 파일 {files.length}개{bad ? ` · 확인에 실패한 기술이 있는 파일 ${bad}개` : ""}{notice ? " · 마지막 읽기가 끝까지 되지 않았어요" : ""}</summary>
      <ul>{files.map((f) => (
        <li key={f.path}><code>{f.path}</code> · 기술 {f.count}개{f.errors
          ? <> · <span className="badge badge-warning">확인 실패 {f.errors}개</span> <span className="muted">지난번 값을 보여 줘요(사라진 게 아니에요). 어느 기술인지는 위 목록의 &quot;수집 오류&quot;</span></>
          : null}</li>
      ))}</ul>
      <p className="muted">숨긴 기술은 세지 않아요. 기술이 하나도 남지 않은 파일과 파일마다 읽었는지는 <Link href="/projects/runs">실행 기록</Link>의 &quot;저장소 받기&quot; 단계에서 볼 수 있어요.</p>
    </details>
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
        <span className={`badge badge-${GRADE_TONE[m.grade]}`}>{gradeText(m.grade, m.technologies?.tech_key)}</span>
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
