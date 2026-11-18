import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { registerProject } from "./actions";

// 프로젝트 등록과 내 기술 목록 최소판(IA-2, P-3). 목록 화면 완성(숨김·직접 추가·상세)은 P-11.
const GRADE_LABEL: Record<string, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: "찾지 못함" };

type Tech = { tech_key: string; display_name: string };
// 등급은 내 버전 기준(my_technologies), 카탈로그(technologies) 등급이 아니다(erd 2.2)
type MyTech = {
  id: string; version: string | null; source_file: string | null; manual_name: string | null; collect_error_kind: string | null;
  grade: string; grade_reason: string | null; last_checked_ok_at: string | null; technologies: Tech | null;
};
type Project = { id: string; name: string; repo_url: string | null; my_technologies: MyTech[] };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { error } = await searchParams;
  const supabase = (await getServerSupabase())!;
  const { data, error: loadError } = await supabase
    .from("projects")
    .select("id, name, repo_url, my_technologies(id, version, source_file, manual_name, collect_error_kind, grade, grade_reason, last_checked_ok_at, technologies(tech_key, display_name))")
    .eq("owner_id", user.id)
    .order("created_at");
  // DB 타입을 생성하기 전이라 다대일(technologies)도 배열로 추론된다. 실제 응답은 한 줄 객체.
  const projects = (data ?? []) as unknown as Project[];

  return (
    <main>
      <h1>내 프로젝트</h1>
      <form action={registerProject} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "end" }}>
        <label>
          공개 GitHub 저장소 주소
          <br />
          <input name="repoUrl" type="url" required placeholder="https://github.com/owner/repo" size={40} />
        </label>
        <button type="submit">등록하고 읽기</button>
      </form>
      {error === "url" && <p role="alert">GitHub 저장소 주소(https://github.com/owner/repo)를 넣어 주세요.</p>}
      {error === "repo" && <p role="alert">이 저장소를 열 수 없어요. 주소가 틀렸거나 비공개일 수 있어요. 공개 GitHub 저장소만 등록할 수 있어요.</p>}
      <p>package.json과 .mcp.json에서 AI 코딩 도구만 읽어요. 이미 등록한 주소를 다시 넣으면 다시 읽어요.</p>

      {loadError ? (
        <p role="alert">목록을 불러오지 못했어요(조회 실패). 잠시 뒤 새로 고쳐 주세요.</p>
      ) : projects.length ? (
        projects.map((p) => <ProjectTechs key={p.id} project={p} />)
      ) : (
        <p>아직 등록한 프로젝트가 없어요.</p>
      )}
    </main>
  );
}

function ProjectTechs({ project }: { project: Project }) {
  return (
    <section>
      <h2>
        {project.name} <small>{project.repo_url}</small>
      </h2>
      {project.my_technologies.length === 0 ? (
        <p>읽은 AI 코딩 도구가 없어요.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">기술</th>
              <th scope="col">버전</th>
              <th scope="col">등급</th>
              <th scope="col">이유</th>
              <th scope="col">읽은 파일</th>
            </tr>
          </thead>
          <tbody>
            {project.my_technologies.map((m) => {
              const t = m.technologies;
              const checked = m.last_checked_ok_at ? new Date(m.last_checked_ok_at).toLocaleDateString("ko-KR") : "없음";
              return (
                <tr key={m.id}>
                  <td>{t?.display_name ?? m.manual_name}</td>
                  <td>{m.version ?? "모름"}</td>
                  <td>
                    {GRADE_LABEL[m.grade]}
                    {m.collect_error_kind && ` · 수집 오류 (마지막 확인 ${checked})`}
                  </td>
                  <td>{m.grade_reason ?? "확인할 수 있는 자료를 찾지 못했어요"}</td>
                  <td>{m.source_file}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
