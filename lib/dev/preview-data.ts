// 개발용 샘플 데이터(실제 기록 아님): app/dev/*-sample 화면과 로그인 화면 미리보기(lib/dev/login-preview.ts)가 같이 쓴다.
// 지도 · 알림 · 기록 · 내 레이더 · 블루프린트가 서로 맞물리게 같은 기술 이름과 id를 쓴다.
import type { AlertRecord } from "@/lib/alerts/to-alert-view";
import type { FirstCheckRun } from "@/lib/alerts/first-check-band";
import type { BlueprintRecord } from "@/lib/blueprint/stored";
import { categoryNames, type CatalogTech, type MapInput, type MyTechRow } from "@/lib/map/build-map";
import type { DashboardData } from "@/lib/server/dashboard-queries";
import type { PoolTech } from "@/lib/server/blueprints";
import type { RecentAlert } from "@/lib/server/recent-alerts";
import type { GalleryRow } from "@/lib/views/gallery";
import type { KanbanInput } from "@/lib/views/kanban";

/** 서버를 켠 때 기준: 화면이 new Date()로 NEW · "며칠 전"을 계산해 날짜를 고정하면 며칠 뒤 NEW가 사라진다 */
export const SAMPLE_NOW = new Date();
const ago = (d: number) => new Date(SAMPLE_NOW.getTime() - d * 86_400_000).toISOString();
/** 주소의 sel=tech:<uuid>·알림 상세가 uuid 모양만 받아서 id도 uuid 모양으로 */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// 추천 큰 갈래 8개와 세부 갈래 예시
const BIG = ["리서치", "기획·문서", "디자인", "프론트엔드", "백엔드·데이터", "검사·보안", "배포·운영", "AI 작업 방식"];
const SMALL: [string, string][] = [["웹 검색", "리서치"], ["문서 작성", "기획·문서"], ["디자인 도구", "디자인"], ["컴포넌트", "프론트엔드"], ["DB", "백엔드·데이터"], ["API", "백엔드·데이터"], ["코드 검사", "검사·보안"], ["배포", "배포·운영"], ["하네스", "AI 작업 방식"]];
const CATS = [...BIG.map((n) => ({ id: n, name: n, parentId: null })), ...SMALL.map(([n, p]) => ({ id: n, name: n, parentId: p }))];
let seq = 0;
const t = (name: string, categoryId: string | null, type: string, o: Partial<CatalogTech> = {}): CatalogTech => ({
  id: uuid(++seq), techKey: `${type === "skill" ? "skill" : type === "sdk" ? "npm" : "mcp"}:${name}`, name, type, hosts: null, categoryId, createdAt: ago(40),
  grade: "pass", gradeReason: "알려진 취약점을 찾지 못했어요(안전 보증은 아님)", oneLiner: `${name}의 한 줄 설명(샘플)`, repoUrl: null,
  lastActivityAt: ago(5), lastActivityKind: "release", lastCheckedOkAt: ago(0.2), collectErrorKind: null, signals: { stars: 800 }, ...o,
});
const TECHS = [
  t("mcp-remote", "API", "mcp", { grade: "danger", gradeReason: "GHSA-6xpm-ggf7-wc3p — 0.1.16에서 고침" }), t("mcp-proxy-lite", "API", "mcp", { createdAt: ago(2) }),
  t("@supabase/mcp-server", "DB", "mcp", { official: true }), t("postgres-mcp", "DB", "mcp", { grade: "caution", gradeReason: "12개월 넘게 활동 없음" }), t("csv-reader", "DB", "sdk"),
  t("firecrawl-mcp", "웹 검색", "mcp"), t("deep-research", "웹 검색", "skill", { createdAt: ago(1) }), t("arxiv-mcp", "리서치", "mcp"),
  t("doc-coauthoring", "문서 작성", "skill"), t("notion-mcp", "기획·문서", "mcp"), t("figma-mcp", "디자인 도구", "mcp"), t("frontend-design", "디자인", "skill"),
  t("storybook-mcp", "컴포넌트", "mcp"), t("design-tokens", "컴포넌트", "sdk", { createdAt: ago(3) }), t("a11y-skill", "프론트엔드", "skill", { grade: "unknown", gradeReason: "근거를 찾지 못했어요" }),
  t("secret-scan", "코드 검사", "mcp", { collectErrorKind: "http_5xx", lastCheckedOkAt: ago(3) }), t("code-review", "코드 검사", "skill"), t("osv-mcp", "검사·보안", "mcp"),
  t("vercel-mcp", "배포", "mcp"), t("github-actions-mcp", "배포·운영", "mcp", { grade: "caution", gradeReason: "토큰 권한이 넓어요" }),
  t("grill-with-docs", "하네스", "skill"), t("지침 파일(CLAUDE.md · AGENTS.md)", "하네스", "concept", { techKey: "concept:harness", grade: "unknown", gradeReason: null }), t("loop-runner", "AI 작업 방식", "skill", { createdAt: ago(4) }), t("context7", null, "mcp"), t("odd-tool", null, "mcp"),
];
const tech = (name: string) => TECHS.find((x) => x.name === name)!;
export const SAMPLE_PROJECTS = [{ id: "p1", name: "시연 저장소" }, { id: "p2", name: "내 컴퓨터(프로젝트 밖)" }];
const mine = (n: number, name: string | null, projectId: string, o: Partial<MyTechRow> = {}): MyTechRow => {
  const found = name ? tech(name) : undefined;
  return { id: `m${n}`, techId: found?.id ?? null, manualName: null, projectId, projectName: SAMPLE_PROJECTS.find((p) => p.id === projectId)!.name, grade: found?.grade ?? "unknown", gradeReason: found?.gradeReason ?? null, collectErrorKind: found?.collectErrorKind ?? null, lastCheckedOkAt: found?.lastCheckedOkAt ?? null, ...o };
};
const MINE = [mine(1, "mcp-remote", "p1"), mine(2, "@supabase/mcp-server", "p1"), mine(3, "storybook-mcp", "p1"), mine(4, "secret-scan", "p2"), mine(5, "firecrawl-mcp", "p1"),
  mine(6, "doc-coauthoring", "p2"), mine(7, "vercel-mcp", "p1"), mine(8, "grill-with-docs", "p2"), mine(9, null, "p2", { manualName: "my-local-tool", grade: "unknown" }),
  mine(10, "지침 파일(CLAUDE.md · AGENTS.md)", "p1", { sourceFile: "CLAUDE.md" })];
const PAIRS: [string, string][] = [["mcp-remote", "mcp-proxy-lite"], ["@supabase/mcp-server", "postgres-mcp"], ["@supabase/mcp-server", "csv-reader"], ["storybook-mcp", "design-tokens"], ["storybook-mcp", "a11y-skill"],
  ["secret-scan", "code-review"], ["secret-scan", "osv-mcp"], ["firecrawl-mcp", "deep-research"], ["firecrawl-mcp", "arxiv-mcp"], ["doc-coauthoring", "notion-mcp"], ["vercel-mcp", "github-actions-mcp"], ["grill-with-docs", "loop-runner"]];

/** 지도 입력. catalog면 프로젝트가 없는 사람의 지도 */
export function sampleMapInput(catalog = false): MapInput {
  return {
    mine: catalog ? [] : MINE, techs: TECHS, categories: CATS,
    relations: catalog ? [] : PAIRS.map(([a, b]) => ({ a: tech(a).id, b: tech(b).id, quote: "시연용 비교군" })),
    marks: catalog ? [] : [{ techId: tech("figma-mcp").id, status: "interest", reason: null }, { techId: tech("deep-research").id, status: "candidate", reason: "리서치 단계에 써 보기" }],
  };
}

let alertSeq = 900;
const alert = (n: number, name: string, o: Partial<AlertRecord> & Pick<AlertRecord, "kind" | "status">): AlertRecord => {
  const found = tech(name);
  return {
    id: uuid(++alertSeq), createdAt: ago(n), projectId: "p1", projectName: "시연 저장소", sourceFile: "package.json", judgment: null, comparison: null, myTechnologyId: null,
    tech: { id: found.id, type: found.type, field: found.categoryId }, ...o,
    change: { kind: "grade_to_danger", techName: name, detectedAt: ago(n), prevValue: null, currValue: null, draft: null, ...o.change },
  };
};
const danger = (reason: string, fixed: string, id: string) => ({ grade: "danger", reason, fixed_version: fixed, evidence: [{ id, severity: "HIGH", fixed, url: `https://osv.dev/vulnerability/${id}` }] });
/** 알림 5개: 판단 대기 3(보안 · 첫 점검 · 적용 기회), 판단 완료 2(적용 후보 · 보류) */
export const SAMPLE_ALERTS: AlertRecord[] = [
  alert(0.1, "mcp-remote", { kind: "security", status: "pending", change: { kind: "grade_to_danger", techName: "mcp-remote", detectedAt: ago(0.1), prevValue: { grade: "caution" }, currValue: danger("외부에서 내 컴퓨터 명령을 실행시킬 수 있어요", "0.1.16", "GHSA-6xpm-ggf7-wc3p"),
    draft: { text: "1. package.json의 mcp-remote를 0.1.16 이상으로 올린다.\n2. 다시 설치하고 연결을 한 번 확인한다.\n(초안이에요. 실행은 사람이 판단한 뒤에)", sources: ["https://osv.dev/vulnerability/GHSA-6xpm-ggf7-wc3p"] } } }),
  alert(0.5, "secret-scan", { kind: "security", status: "pending", projectId: "p2", projectName: null, sourceFile: null, change: { kind: "first_seen_danger", techName: "secret-scan", detectedAt: ago(0.5), prevValue: null, currValue: danger("검사 결과를 밖으로 보낼 수 있어요", "2.3.1", "GHSA-aaaa-bbbb-cccc"), draft: null } }),
  alert(1, "mcp-proxy-lite", { kind: "opportunity", status: "pending", change: { kind: "same_role_new", techName: "mcp-proxy-lite", detectedAt: ago(1), prevValue: null, currValue: null, draft: null } }),
  alert(3, "deep-research", { kind: "opportunity", status: "done", judgment: { decision: "candidate", reason: "리서치 단계에 써 보기", fixedVersion: null, judgedAt: ago(2) }, change: { kind: "same_role_new", techName: "deep-research", detectedAt: ago(3), prevValue: null, currValue: null, draft: null } }),
  alert(6, "postgres-mcp", { kind: "security", status: "done", judgment: { decision: "hold", reason: "지금은 Supabase MCP로 충분해요", fixedVersion: null, judgedAt: ago(5) }, change: { kind: "grade_to_danger", techName: "postgres-mcp", detectedAt: ago(6), prevValue: { grade: "pass" }, currValue: danger("오래된 드라이버에 알려진 문제가 있어요", "1.4.0", "GHSA-dddd-eeee-ffff"), draft: null } }),
];

export const SAMPLE_DASHBOARD: DashboardData = { alerts: SAMPLE_ALERTS, techs: MINE.map((m) => ({ projectId: m.projectId })), projects: SAMPLE_PROJECTS };

/** 확인 안 한 첫 점검 1번(지도 위 띠 · 시작하기 2/3) */
export const SAMPLE_FIRST_READS: FirstCheckRun[] = [{ id: uuid(800), status: "succeeded", steps: [{ stepName: "grade", branchCounts: { danger: 2, caution: 1, pass: 5, unknown: 2 } }] }];

export const SAMPLE_RECENT: { items: RecentAlert[]; pending: number } = {
  items: SAMPLE_ALERTS.map((a) => ({ id: a.id, kind: a.kind, pending: a.status === "pending", name: a.change.techName, at: a.createdAt })),
  pending: SAMPLE_ALERTS.filter((a) => a.status === "pending").length,
};

/** 기록 화면의 지도 판단(tech_mark_events 모양) */
export const SAMPLE_MARK_EVENTS = [
  { id: 2, created_at: ago(1.5), tech_id: tech("deep-research").id, new_status: "candidate" as const, reason: "리서치 단계에 써 보기", technologies: { display_name: "deep-research" } },
  { id: 1, created_at: ago(4), tech_id: tech("figma-mcp").id, new_status: "interest" as const, reason: null, technologies: { display_name: "figma-mcp" } },
];

/** 갤러리 카드 = 내 기술(지도와 같은 10개, 개념 카드 하나 포함) */
export const SAMPLE_GALLERY: GalleryRow[] = MINE.map((m) => {
  const found = TECHS.find((x) => x.id === m.techId);
  return { id: m.id, name: found?.name ?? m.manualName ?? "(이름 없음)", version: found?.type === "concept" || !found ? null : "1.0.0", grade: m.grade, gradeReason: m.gradeReason,
    collectErrorKind: m.collectErrorKind, lastCheckedOkAt: m.lastCheckedOkAt, projectName: m.projectName, concept: found?.type === "concept" };
});
/** 칸반 = 내 기술 + 지도 판단(sampleMapInput 표시) + 판단한 알림. 다른 화면과 같은 기록 */
const CAT_MAP = new Map(CATS.map((c) => [c.id, c]));
const fieldOf = (techId: string | null) => categoryNames(TECHS.find((x) => x.id === techId)?.categoryId ?? null, CAT_MAP).field;
export const SAMPLE_KANBAN: KanbanInput = {
  mine: MINE.map((m, i) => ({ id: m.id, techId: m.techId, name: SAMPLE_GALLERY[i].name, grade: m.grade, projectName: m.projectName, field: fieldOf(m.techId) })),
  marks: (sampleMapInput().marks ?? []).map((m) => { const found = TECHS.find((x) => x.id === m.techId)!; return { ...m, name: found.name, grade: found.grade, updatedAt: ago(1.5), field: fieldOf(m.techId) }; }),
  judged: SAMPLE_ALERTS.flatMap((a) => (a.judgment && a.tech ? [{ techId: a.tech.id, name: a.change.techName, grade: tech(a.change.techName).grade, decision: a.judgment.decision, reason: a.judgment.reason, judgedAt: a.judgment.judgedAt, field: fieldOf(a.tech.id) }] : [])),
};
/** 보드 "묶기: 내 태그"용 내 태그(기술 id → 태그들) */
export const SAMPLE_TAGS: Record<string, string[]> = { [tech("mcp-remote").id]: ["시연", "바꿀 것"], [tech("deep-research").id]: ["시연"], [tech("@supabase/mcp-server").id]: ["매일 씀"] };

const pool = (id: string, name: string, field: string, extra: Partial<PoolTech> = {}): PoolTech =>
  ({ id: uuid(Number(id) + 500), name, type: "mcp", grade: "pass", field, sub: null, oneLiner: `${name} 한 줄 소개`, projects: 1, mark: null, ...extra });
const POOL = [
  pool("1", "Context7", "기획·문서"), pool("2", "Playwright MCP", "프론트엔드", { sub: "브라우저 자동화" }), pool("3", "Supabase MCP", "백엔드·데이터", { projects: 2 }),
  pool("4", "Vercel", "배포·운영"), pool("5", "mcp-remote", "업무·서비스 연동", { grade: "danger" }), pool("6", "Figma MCP", "디자인", { mark: "candidate", projects: 0 }),
  pool("7", "Semgrep", "검사·보안", { mark: "candidate", projects: 0 }),
  pool("8", "deep-research", "리서치", { id: tech("deep-research").id, type: "skill", mark: "candidate", projects: 0 }), // 보드 · 알림에서 적용 후보로 고른 것과 같은 id("청사진에 넣기" 시연)
];
const HISTORY: BlueprintRecord[] = [
  { id: "h1", name: "TechRadar 1차", projectId: "p1", projectName: "TechRadar", createdAt: "2026-11-10T03:00:00Z",
    board: [[{ name: "기획", techs: [{ id: POOL[0].id, name: "Context7" }] }], [{ name: "개발", techs: [{ id: POOL[2].id, name: "Supabase MCP" }] }], [{ name: "배포", techs: [{ id: POOL[3].id, name: "Vercel" }] }]] },
];
export const SAMPLE_BLUEPRINT = { pool: POOL, history: HISTORY, projects: [{ id: "p1", name: "TechRadar" }] };
