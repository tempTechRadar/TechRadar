// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 설치 프롬프트·가져오기 화면을 가짜 내 기술로 눈으로 보는 용도.
// 실제 기록이 아니다. 배포(운영·미리보기)에서는 404. 저장 버튼은 로그인 전이라 실패 안내가 나온다.
import { notFound } from "next/navigation";
import type { MyTechRow } from "@/lib/install/from-my-tech";
import { ImportScreen } from "../../projects/install/import-screen";
import { InstallScreen } from "../../projects/install/install-screen";

const tech = (tech_key: string, type: string, repo_url: string | null = null) => ({ tech_key, type, repo_url });
const ROWS: MyTechRow[] = [
  { id: "a", origin: "repo", version: "2.119.0", grade: "pass", grade_reason: null, grade_evidence: null, hidden_at: null, technologies: tech("npm:@supabase/supabase-js", "sdk", "https://github.com/supabase/supabase-js") },
  { id: "b", origin: "repo", version: "0.1.15", grade: "danger", grade_reason: "위험: GHSA-6xpm-ggf7-wc3p (CRITICAL)", grade_evidence: [{ id: "GHSA-6xpm-ggf7-wc3p", severity: "CRITICAL", fixed: "0.1.16" }], hidden_at: null, technologies: tech("npm:mcp-remote", "mcp", "https://github.com/geelen/mcp-remote") },
  { id: "c", origin: "repo", version: "0.14.0", grade: "danger", grade_reason: "위험: GHSA-7f8r-222p-6f5g", grade_evidence: [{ id: "GHSA-7f8r-222p-6f5g", severity: "CRITICAL", fixed: "0.14.1" }, { id: "GHSA-x", severity: "HIGH", fixed: "0.16.6" }], hidden_at: null, technologies: tech("npm:@modelcontextprotocol/inspector", "mcp") },
  { id: "d", origin: "import", version: "1.0.0", grade: "unknown", grade_reason: null, grade_evidence: null, hidden_at: null, technologies: tech("pypi:mcp-server-time", "mcp") },
  { id: "e", origin: "manual", version: null, grade: "unknown", grade_reason: null, grade_evidence: null, hidden_at: null, technologies: null },
];

export default function InstallSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main>
      <h1>설치 프롬프트 샘플 (실제 기록 아님)</h1>
      <p role="note" style={{ background: "#fff1d6", padding: "8px 12px", borderRadius: 8 }}>개발 컴퓨터에서만 보이는 화면이에요. 가짜 사용 중인 항목 5개로 그렸어요. inspector는 &quot;고친 버전으로 올리기&quot;를 고른 것으로 두었어요.</p>
      <InstallScreen rows={ROWS} pins={[["c", "0.16.6"]]} />
      <ImportScreen />
    </main>
  );
}
