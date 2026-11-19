// 개발 컴퓨터(next dev)에서만 열리는 샘플 화면: 첫 화면 지도(P-12c)를 가짜 기술로 눈으로 보는 용도. 배포에서는 404.
// ?mode=catalog 이면 프로젝트가 없는 사람의 지도. 보기 설정은 실제 화면과 같이 주소(g·c·fk·ff·risky·new·mine·p)로.
import { notFound } from "next/navigation";
import { buildTechMap, type CatalogTech, type MyTechRow } from "@/lib/map/build-map";
import { TechMap } from "../../tech-map";
import "../../alerts/alerts.css";
import "../../tech-map.css";

const NOW = new Date("2026-11-19T09:00:00+09:00");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
// 추천 큰 갈래 8개(단계 2에서 DB에 넣을 예정)와 세부 갈래 예시
const BIG = ["리서치", "기획·문서", "디자인", "프론트엔드", "백엔드·데이터", "검사·보안", "배포·운영", "AI 작업 방식"];
const SMALL: [string, string][] = [["웹 검색", "리서치"], ["문서 작성", "기획·문서"], ["디자인 도구", "디자인"], ["컴포넌트", "프론트엔드"], ["DB", "백엔드·데이터"], ["API", "백엔드·데이터"], ["코드 검사", "검사·보안"], ["배포", "배포·운영"], ["하네스", "AI 작업 방식"]];
const CATS = [...BIG.map((n) => ({ id: n, name: n, parentId: null })), ...SMALL.map(([n, p]) => ({ id: n, name: n, parentId: p }))];
let seq = 0;
const t = (name: string, categoryId: string | null, type: string, o: Partial<CatalogTech> = {}): CatalogTech => ({
  id: String(++seq), techKey: `${type === "skill" ? "skill" : type === "sdk" ? "npm" : "mcp"}:${name}`, name, type, hosts: null, categoryId, createdAt: ago(40),
  grade: "pass", gradeReason: "알려진 취약점을 찾지 못했어요(안전 보증은 아님)", oneLiner: `${name}의 한 줄 설명(샘플)`, repoUrl: null,
  lastActivityAt: ago(5), lastActivityKind: "release", lastCheckedOkAt: ago(0.2), collectErrorKind: null, signals: { stars: 800 }, ...o,
});
const TECHS = [
  t("mcp-remote", "API", "mcp", { grade: "danger", gradeReason: "GHSA-6xpm-ggf7-wc3p — 0.1.16에서 고침" }), t("mcp-proxy-lite", "API", "mcp", { createdAt: ago(2) }),
  t("@supabase/mcp-server", "DB", "mcp"), t("postgres-mcp", "DB", "mcp", { grade: "caution", gradeReason: "12개월 넘게 활동 없음" }), t("csv-reader", "DB", "sdk"),
  t("firecrawl-mcp", "웹 검색", "mcp"), t("deep-research", "웹 검색", "skill", { createdAt: ago(1) }), t("arxiv-mcp", "리서치", "mcp"),
  t("doc-coauthoring", "문서 작성", "skill"), t("notion-mcp", "기획·문서", "mcp"), t("figma-mcp", "디자인 도구", "mcp"), t("frontend-design", "디자인", "skill"),
  t("storybook-mcp", "컴포넌트", "mcp"), t("design-tokens", "컴포넌트", "sdk", { createdAt: ago(3) }), t("a11y-skill", "프론트엔드", "skill", { grade: "unknown", gradeReason: "근거를 찾지 못했어요" }),
  t("secret-scan", "코드 검사", "mcp", { collectErrorKind: "http_5xx", lastCheckedOkAt: ago(3) }), t("code-review", "코드 검사", "skill"), t("osv-mcp", "검사·보안", "mcp"),
  t("vercel-mcp", "배포", "mcp"), t("github-actions-mcp", "배포·운영", "mcp", { grade: "caution", gradeReason: "토큰 권한이 넓어요" }),
  t("grill-with-docs", "하네스", "skill"), t("loop-runner", "AI 작업 방식", "skill", { createdAt: ago(4) }), t("context7", null, "mcp"), t("odd-tool", null, "mcp"),
];
const id = (name: string) => TECHS.find((x) => x.name === name)!.id;
const mine = (n: number, name: string | null, projectId: string, o: Partial<MyTechRow> = {}): MyTechRow => {
  const tech = name ? TECHS.find((x) => x.name === name) : undefined;
  return { id: `m${n}`, techId: tech?.id ?? null, manualName: null, projectId, projectName: projectId === "p1" ? "시연 저장소" : "내 컴퓨터(프로젝트 밖)", grade: tech?.grade ?? "unknown", gradeReason: tech?.gradeReason ?? null, collectErrorKind: tech?.collectErrorKind ?? null, lastCheckedOkAt: tech?.lastCheckedOkAt ?? null, ...o };
};
const MINE = [mine(1, "mcp-remote", "p1"), mine(2, "@supabase/mcp-server", "p1"), mine(3, "storybook-mcp", "p1"), mine(4, "secret-scan", "p2"), mine(5, "firecrawl-mcp", "p1"),
  mine(6, "doc-coauthoring", "p2"), mine(7, "vercel-mcp", "p1"), mine(8, "grill-with-docs", "p2"), mine(9, null, "p2", { manualName: "my-local-tool", grade: "unknown" })];
const PAIRS: [string, string][] = [["mcp-remote", "mcp-proxy-lite"], ["@supabase/mcp-server", "postgres-mcp"], ["@supabase/mcp-server", "csv-reader"], ["storybook-mcp", "design-tokens"], ["storybook-mcp", "a11y-skill"],
  ["secret-scan", "code-review"], ["secret-scan", "osv-mcp"], ["firecrawl-mcp", "deep-research"], ["firecrawl-mcp", "arxiv-mcp"], ["doc-coauthoring", "notion-mcp"], ["vercel-mcp", "github-actions-mcp"], ["grill-with-docs", "loop-runner"]];

export default async function MapSamplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams, catalog = params.mode === "catalog";
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string" && e[0] !== "mode")).toString();
  const model = buildTechMap({ mine: catalog ? [] : MINE, techs: TECHS, relations: catalog ? [] : PAIRS.map(([a, b]) => ({ a: id(a), b: id(b) })), categories: CATS }, NOW);
  return (
    <main className="alerts map-page">
      <h1 className="sr-only">기술 지도 샘플</h1>
      <TechMap model={model} projects={[{ id: "p1", name: "시연 저장소" }, { id: "p2", name: "내 컴퓨터(프로젝트 밖)" }]} initialQuery={query} />
    </main>
  );
}
