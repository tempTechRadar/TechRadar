import Link from "next/link";
import { redirect } from "next/navigation";
import { LOCAL_PROJECT_NAME } from "@/lib/server/local-import";
import { GRADE_OPTIONS, keepView, searchTerm, TECH_ERROR_TEXT } from "@/lib/domain/my-tech-view";
import { getCurrentUser } from "@/lib/server/current-user";
import { searchCatalog, type CatalogHit } from "@/lib/server/my-tech";
import { getServerSupabase } from "@/lib/supabase/server";
import { FilterSelect } from "../alerts/filter-select";
import "../alerts/alerts.css";
import "../views/views.css";
import { registerProject, setProjectArchived } from "./actions";
import { PROJECT_ERROR_TEXT, PROJECT_NOTICE_TEXT } from "@/lib/domain/project-edit";
import { AddTech } from "./add-tech";
import { ProjectTechs, type ProjectRow } from "./tech-table";

// 등록 · 다시 읽기(서버 액션)가 이 화면에서 돈다: 저장소 파일 · 코드 파일 · OSV(1초 간격)를 다 읽을 시간. Hobby 최대(2026-11 공식 문서)
export const maxDuration = 300;

// 프로젝트 등록과 내 기술 목록(IA-2·3, P-3·P-11). 기술을 누르면 기술 상세(IA-4). 내 실행 기록 탭은 ./runs, 설치 프롬프트는 ./install.
type Query = { error?: string; notice?: string; audit?: string; grade?: string; project?: string; hidden?: string; q?: string };

const NOTICE_TEXT: Record<string, string> = { hidden: "숨겼어요. 다시 읽어도 되살아나지 않아요.", restored: "되돌렸어요.", added: "목록에 추가했어요." };
const URL_ERROR_TEXT: Record<string, string> = {
  url: "GitHub 저장소 주소(https://github.com/owner/repo)를 넣어 주세요.",
  repo: "이 저장소를 열 수 없어요. 주소가 틀렸거나 비공개일 수 있어요. 공개 GitHub 저장소만 등록할 수 있어요.",
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const query = await searchParams;
  const supabase = (await getServerSupabase())!;
  const { data, error: loadError } = await supabase
    .from("projects")
    .select("id, name, kind, repo_url, memo, my_technologies(id, origin, version, source_file, manual_name, hidden_at, read_at, collect_error_kind, grade, grade_reason, last_checked_ok_at, technologies(tech_key, display_name)), runs!runs_project_id_fkey(status, created_at)")
    .eq("owner_id", user.id)
    .is("archived_at", null)
    .order("created_at");
  // runs: 마지막 읽기 상태 안내용. 본인의 첫 읽기·다시 읽기만 RLS로 보이고, 최신 선택은 readStatusNotice가 created_at으로 한다(서버 정렬에 기대지 않음).
  // 외래키 이름을 적어 나중에 projects↔runs 연결이 늘어도 이 목록 전체가 깨지지 않게 한다.
  // shortcut: runs에 project_id 인덱스가 없어 행이 수만 개가 되면 느려진다. 그때 runs(project_id, created_at) 인덱스를 더하거나 프로젝트별 최신 1개만 읽는다.
  // DB 타입을 생성하기 전이라 다대일(technologies)도 배열로 추론된다. 실제 응답은 한 줄 객체.
  const projects = (data ?? []) as unknown as ProjectRow[];
  // 보관한 프로젝트(PRD-F4): 이름만 읽어 되살리기 단추를 보인다. 못 읽으면 "없음"이 아니라 "읽지 못했어요"(불변 2)
  const archivedRes = await supabase.from("projects").select("id, name, archived_at").eq("owner_id", user.id).not("archived_at", "is", null).order("archived_at", { ascending: false });
  const archived = (archivedRes.data ?? []) as { id: string; name: string; archived_at: string }[];
  const term = searchTerm(query.q ?? "");
  let hits: CatalogHit[] | null = null;
  let searchFailed = false;
  if (term) {
    hits = await searchCatalog(supabase, query.q ?? "").catch((e) => { console.error("기술 검색 실패", e); searchFailed = true; return null; });
  }
  const filter = { grade: query.grade, showHidden: query.hidden === "1" };
  const back = keepView(query); // 숨기기·추가 뒤에 같은 화면으로 돌아오게 폼에 싣는다
  const carry = keepView({ grade: query.grade, project: query.project, hidden: query.hidden }); // 검색해도 거르기를 지우지 않게
  const shown = projects.filter((p) => !query.project || p.id === query.project);
  const errorText = query.error ? URL_ERROR_TEXT[query.error] ?? TECH_ERROR_TEXT[query.error] ?? (PROJECT_ERROR_TEXT as Record<string, string>)[query.error] : undefined;
  const noticeText = query.notice ? NOTICE_TEXT[query.notice] ?? (PROJECT_NOTICE_TEXT as Record<string, string>)[query.notice] : undefined;

  return (
    <main className="alerts">
      <h1>내 프로젝트</h1>
      <nav className="views-tabs" aria-label="내 프로젝트 화면">
        <a href="#techs" aria-current="page">내 기술</a>
        <Link href="/projects/runs">실행 기록</Link>
        <Link href="/projects/install">설치 프롬프트 · 가져오기</Link>
        <a href="#add-title">직접 추가</a>
      </nav>
      <form action={registerProject} className="filters" style={{ alignItems: "end" }}>
        <label>
          공개 GitHub 저장소 주소
          <input name="repoUrl" type="url" required placeholder="https://github.com/owner/repo" size={40} />
        </label>
        <button className="btn btn-primary" type="submit">등록하고 읽기</button>
      </form>
      <p className="muted">package.json, requirements.txt, .mcp.json, .claude/skills와 Cursor · VS Code · Gemini CLI의 MCP 설정(.cursor/mcp.json · .vscode/mcp.json · .gemini/settings.json)에서 AI 코딩 도구만 읽어요. 이미 등록한 주소를 다시 넣으면 다시 읽어요.</p>
      {errorText && <p className="notice notice-error" role="alert">{errorText}</p>}
      {noticeText && <p className="notice notice-empty" role="status">{noticeText}</p>}
      {query.audit === "0" && <p className="notice notice-error" role="alert">바뀐 것은 저장됐지만 "누가·언제 바꿨는지" 기록을 남기지 못했어요. 팀에 알려 주세요.</p>}

      <div id="techs" />
      {loadError ? (
        <p className="notice notice-error" role="alert">목록을 불러오지 못했어요(조회 실패). 잠시 뒤 새로 고쳐 주세요.</p>
      ) : projects.length === 0 ? (
        <p>아직 등록한 프로젝트가 없어요.</p>
      ) : (
        <>
          <form method="get" className="filters" aria-label="목록 거르기">
            {term && <input type="hidden" name="q" value={term} />}
            <FilterSelect label="등급" name="grade" value={query.grade} options={GRADE_OPTIONS} />
            <FilterSelect label="프로젝트" name="project" value={query.project} options={[["", "전체"], ...projects.map((p): [string, string] => [p.id, p.name])]} />
            <label style={{ alignSelf: "end" }}>
              <input type="checkbox" name="hidden" value="1" defaultChecked={filter.showHidden} /> 숨긴 기술도 보기
            </label>
            <button className="btn" type="submit" style={{ alignSelf: "end" }}>거르기</button>
          </form>
          {shown.map((p) => <ProjectTechs key={p.id} project={p} filter={filter} back={back} />)}
        </>
      )}
      {/* "프로젝트 밖(내 컴퓨터)" 칸은 처음부터 보인다(design.md 18절): 저장소 없이 쓰는 도구를 넣는 곳 */}
      {!loadError && !projects.some((p) => p.kind === "local") && (!query.project) ? (
        <section className="card" aria-labelledby="p-local">
          <h2 id="p-local">{LOCAL_PROJECT_NAME}</h2>
          <p>저장소 없이 내 컴퓨터에서 쓰는 도구를 넣는 곳이에요. 아직 넣은 기술이 없어요.</p>
          <p><a href="#add-title">직접 추가</a>하거나 <Link href="/projects/install">설치 프롬프트에서 가져오기</Link>로 넣을 수 있어요.</p>
        </section>
      ) : null}
      {archivedRes.error ? <p className="notice notice-error" role="alert">보관한 프로젝트를 읽지 못했어요(없다는 뜻이 아니에요).</p> : archived.length ? (
        <section className="card" aria-labelledby="archived-title">
          <h2 id="archived-title">보관한 프로젝트 {archived.length}</h2>
          <p className="muted">목록 · 지도 · 숫자에서 빠져 있어요. 기록은 그대로예요.</p>
          <ul>{archived.map((p) => (
            <li key={p.id}>{p.name} <form action={setProjectArchived} style={{ display: "inline" }}><input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="archive" value="0" /><button type="submit" className="btn">되살리기</button></form></li>
          ))}</ul>
        </section>
      ) : null}
      {!loadError && <AddTech projects={projects} q={query.q ?? ""} hits={hits} searchFailed={searchFailed} back={back} carry={carry} />}
    </main>
  );
}
