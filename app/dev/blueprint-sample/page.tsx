// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 블루프린트 판 · 서랍 · 이력을 가짜 내 기술로 눈으로 보는 용도. 배포에서는 404.
// 확정 · 카탈로그 찾기는 실제 서버 액션이라 여기서는 로그인 없이 실패 안내가 뜬다(그 모양 확인용).
import { notFound } from "next/navigation";
import type { PoolTech } from "@/lib/server/blueprints";
import type { BlueprintRecord } from "@/lib/blueprint/stored";
import { BlueprintApp } from "../../blueprint/blueprint-app";
import "../../alerts/alerts.css";
import "../../blueprint/blueprint.css";

const t = (id: string, name: string, field: string, extra: Partial<PoolTech> = {}): PoolTech =>
  ({ id: `00000000-0000-4000-8000-${id.padStart(12, "0")}`, name, type: "mcp", grade: "pass", field, sub: null, oneLiner: `${name} 한 줄 소개`, projects: 1, mark: null, ...extra });
const POOL = [
  t("1", "Context7", "기획·문서"), t("2", "Playwright MCP", "프론트엔드", { sub: "브라우저 자동화" }), t("3", "Supabase MCP", "백엔드·데이터", { projects: 2 }),
  t("4", "Vercel", "배포·운영"), t("5", "mcp-remote", "업무·서비스 연동", { grade: "danger" }), t("6", "Figma MCP", "디자인", { mark: "interest", projects: 0 }),
  t("7", "Semgrep", "검사·보안", { mark: "candidate", projects: 0 }),
];
const HISTORY: BlueprintRecord[] = [
  { id: "h1", name: "TechRadar 1차", projectId: "p1", projectName: "TechRadar", createdAt: "2026-11-10T03:00:00Z",
    board: [[{ name: "기획", techs: [{ id: POOL[0].id, name: "Context7" }] }], [{ name: "개발", techs: [{ id: POOL[2].id, name: "Supabase MCP" }] }], [{ name: "배포", techs: [{ id: POOL[3].id, name: "Vercel" }] }]] },
];

export default function BlueprintSamplePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="alerts bp-page">
      <h1 className="sr-only">블루프린트 샘플</h1>
      <BlueprintApp who="sample" pool={POOL} history={HISTORY} projects={[{ id: "p1", name: "TechRadar" }]} />
    </main>
  );
}
