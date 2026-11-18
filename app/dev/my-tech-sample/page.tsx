// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 내 기술 목록·직접 추가·기술 상세를 가짜 자료로 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404. 버튼은 로그인 전이라 눌러도 로그인 화면으로 간다.
import { notFound } from "next/navigation";
import type { MyTechDetail } from "@/lib/server/my-tech";
import { AddTech } from "../../projects/add-tech";
import { ProjectTechs, type ProjectRow } from "../../projects/tech-table";
import { TechDetail } from "../../projects/tech/[id]/tech-detail";
import "../../alerts/alerts.css";

const NOW = "2026-11-18T05:00:00Z";
const tech = (tech_key: string, display_name: string) => ({ tech_key, display_name });
const PROJECTS: ProjectRow[] = [
  {
    id: "p1", name: "demo-repo", kind: "repo", repo_url: "https://github.com/o/demo-repo",
    my_technologies: [
      { id: "a", origin: "repo", version: "0.1.15", source_file: "package.json", manual_name: null, hidden_at: null, read_at: NOW, collect_error_kind: null, grade: "danger", grade_reason: "이 버전(0.1.15)에 심각도 CRITICAL인 알려진 문제가 있어요(GHSA-6xpm-ggf7-wc3p). 0.1.16 이상으로 올리면 고쳐져요.", last_checked_ok_at: NOW, technologies: tech("npm:mcp-remote", "mcp-remote") },
      { id: "b", origin: "repo", version: "2.119.0", source_file: "package.json", manual_name: null, hidden_at: null, read_at: NOW, collect_error_kind: "rate_limited", grade: "unknown", grade_reason: null, last_checked_ok_at: null, technologies: tech("npm:@supabase/supabase-js", "@supabase/supabase-js") },
      { id: "c", origin: "repo", version: null, source_file: ".mcp.json", manual_name: null, hidden_at: NOW, read_at: NOW, collect_error_kind: null, grade: "pass", grade_reason: "알려진 문제가 없어요.", last_checked_ok_at: NOW, technologies: tech("npm:time-server", "time-server") },
    ],
  },
  {
    id: "p2", name: "내 컴퓨터(프로젝트 밖)", kind: "local", repo_url: null,
    my_technologies: [
      { id: "d", origin: "manual", version: null, source_file: null, manual_name: "내가 만든 도구", hidden_at: null, read_at: null, collect_error_kind: null, grade: "unknown", grade_reason: null, last_checked_ok_at: null, technologies: null },
      { id: "e", origin: "import", version: "1.0.0", source_file: null, manual_name: null, hidden_at: null, read_at: null, collect_error_kind: null, grade: "caution", grade_reason: "덜 심각한 알려진 문제가 1건 있어요(GHSA-aaaa).", last_checked_ok_at: NOW, technologies: tech("pypi:mcp-server-time", "mcp-server-time") },
    ],
  },
];

const DETAIL: MyTechDetail = {
  id: "a", origin: "repo", source_file: "package.json", version: "0.1.15", manual_name: null, hidden_at: null, read_at: NOW, collect_error_kind: null,
  grade: "danger", grade_reason: PROJECTS[0].my_technologies[0].grade_reason,
  grade_evidence: [{ id: "GHSA-6xpm-ggf7-wc3p", aliases: ["CVE-2025-6514"], severity: "CRITICAL", fixed: "0.1.16", url: "https://osv.dev/vulnerability/GHSA-6xpm-ggf7-wc3p" }, { id: "GHSA-x", severity: "HIGH", fixed: null, url: "https://evil.example/x" }],
  grade_rule_version: "v1", graded_at: NOW, last_checked_ok_at: NOW, projects: { name: "demo-repo" },
  technologies: { id: "t1", tech_key: "npm:mcp-remote", display_name: "mcp-remote", type: "mcp", status: "active", one_liner: null, repo_url: "https://github.com/geelen/mcp-remote", license: null, last_activity_at: NOW, last_activity_kind: "release", is_official: false, last_checked_ok_at: NOW },
};

export default async function MyTechSamplePage({ searchParams }: { searchParams: Promise<{ view?: string; hidden?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view, hidden } = await searchParams;
  if (view === "detail") return <TechDetail d={DETAIL} />;
  return (
    <main className="alerts">
      <h1>내 기술 목록 샘플 (실제 기록 아님)</h1>
      <p className="notice notice-empty" role="note">개발 컴퓨터에서만 보이는 화면이에요. <a href="?view=detail">기술 상세 샘플</a> · <a href="?hidden=1">숨긴 기술도 보기</a></p>
      {PROJECTS.map((p) => <ProjectTechs key={p.id} project={p} filter={{ showHidden: hidden === "1" }} back="" />)}
      <AddTech projects={PROJECTS} q="mcp" searchFailed={false} back="" carry="" hits={[{ id: "t1", tech_key: "npm:mcp-remote", display_name: "mcp-remote", type: "mcp" }, { id: "t2", tech_key: "pypi:mcp-server-time", display_name: "mcp-server-time", type: "mcp" }]} />
    </main>
  );
}
