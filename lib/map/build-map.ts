// 첫 화면 기술 지도(PRD-F23, IA-10)에 올릴 점과 비교군 선을 정하는 순수 함수. 자리는 사용자가 고른 묶기 기준에 따라 화면에서 정한다(layout.ts).
// 늘 모은 기술 전체(ADR 0027) + 프로젝트가 있으면 내 기술(모든 프로젝트 합침)과 확정된 비교군 한 단계(IA-Q5, nearMine).

export type Grade = "pass" | "caution" | "danger" | "unknown";
export const GRADE_RANK: Record<Grade, number> = { danger: 3, caution: 2, unknown: 1, pass: 0 };
export const GRADE_KO: Record<Grade, string> = { danger: "위험", caution: "주의", pass: "통과", unknown: "찾지 못함" };
export const KIND_KO: Record<string, string> = { mcp: "MCP", skill: "스킬", plugin: "플러그인", sdk: "패키지", model: "모델", service: "연동 서비스", concept: "개념" };
export const UNSORTED = "분류 전";

/** 묶기·색·거르기에 쓰는 기준(view-config.ts의 Dim과 같은 이름) */
export type Attrs = { field: string; sub: string; kind: string; host: string; grade: string; project: string };

export type CatalogTech = {
  id: string; techKey: string; name: string; type: string; hosts: string[] | null; categoryId: string | null; createdAt: string | null;
  grade: Grade; gradeReason: string | null; oneLiner: string | null; repoUrl: string | null;
  lastActivityAt: string | null; lastActivityKind: string | null; lastCheckedOkAt: string | null;
  collectErrorKind: string | null; signals: Record<string, unknown> | null;
};
export type MyTechRow = {
  id: string; techId: string | null; manualName: string | null; projectId: string; projectName: string; sourceFile?: string | null;
  grade: Grade; gradeReason: string | null; collectErrorKind: string | null; lastCheckedOkAt: string | null;
};
export type Category = { id: string; name: string; parentId: string | null };
export type Relation = { a: string; b: string; quote: string | null };
export type MarkStatus = "interest" | "candidate" | "hold";
export type Mark = { techId: string; status: MarkStatus; reason: string | null };
/** newSince: 이 시각 뒤에 들어온 것만 NEW(카탈로그를 처음 채운 날 들어온 수천 개를 NEW로 치지 않게) */
export type MapInput = { mine: MyTechRow[]; techs: CatalogTech[]; relations: Relation[]; categories: Category[]; marks?: Mark[]; newSince?: string };

export type MapNode = {
  key: string; name: string; mine: boolean; techId: string | null; myTechIds: string[]; projectIds: string[]; projectNames: string[];
  attrs: Attrs; hostGuessed: boolean; grade: Grade; gradeReason: string | null; collectErrorKind: string | null; lastCheckedOkAt: string | null;
  oneLiner: string | null; type: string | null; hosts: string[]; repoUrl: string | null; lastActivityAt: string | null; lastActivityKind: string | null;
  stars: number | null; weeklyDownloads: number | null; isNew: boolean; lonely: boolean; label: string;
  /** 내 기술과 확정 비교군으로 이어짐(한 단계) */ nearMine: boolean; mark: Mark | null;
  /** 카탈로그 등급(판단 줄의 "위험이면 적용 후보 막기"는 DB 규칙 set_tech_mark처럼 이것을 본다. grade는 내 기술이면 내 버전 중 가장 나쁜 것) */ catalogGrade: Grade;
};
/** quotes: 비교군 선마다 왜 비교군인지(관리자가 확인한 근거 한 줄), 키는 `a|b`(작은 키가 앞) */
export type TechMapModel = { mode: "mine" | "catalog"; nodes: MapNode[]; edges: [string, string][]; quotes: Record<string, string> };

const DAY = 86_400_000;
const NEW_DAYS = 7;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const daysSince = (iso: string | null, now: Date) => (iso ? Math.floor((now.getTime() - Date.parse(iso)) / DAY) : null);

/** 카드·사이드바에 쓰는 업데이트 한 줄. 확인에 실패한 기술은 "업데이트 n일 전" 대신 "수집 오류"(불변 2, PRD-F23 끝 기준) */
export function labelOf(collectErrorKind: string | null, lastActivityAt: string | null, now: Date): string {
  if (collectErrorKind) return "수집 오류";
  const d = daysSince(lastActivityAt, now);
  return d === null ? "업데이트 모름" : d <= 0 ? "오늘 업데이트" : `업데이트 ${d}일 전`;
}

/** 쓰는 곳: hosts 칸이 비면(지금 운영은 모두 빔) 기술 키·종류로 추정하고 추정이라고 표시한다 */
export function hostOf(techKey: string | null, type: string | null, hosts: string[] | null): { host: string; guessed: boolean } {
  if (hosts?.length) return { host: hosts[0], guessed: false };
  const k = techKey ?? "";
  const host = k.startsWith("skill:") || type === "skill" || type === "plugin" ? "Claude Code"
    : k.startsWith("mcp:") || type === "mcp" ? "MCP 쓰는 도구"
    : k.startsWith("npm:") || k.startsWith("pypi:") || type === "sdk" ? "앱 코드"
    : k.startsWith("service:") || type === "service" ? "연동 서비스"
    : type === "concept" ? "작업 방식" : "모름";
  return { host, guessed: true };
}

/** 내 기술은 읽은 파일로 쓰는 곳을 안다(PRD-F39): 추정이 아니다. 모르는 파일 · 직접 추가는 null(카탈로그 추정을 쓴다) */
export function hostOfSource(sourceFile: string | null | undefined): string | null {
  if (!sourceFile) return null;
  if (sourceFile === ".mcp.json" || sourceFile.startsWith(".claude/")) return "Claude Code";
  if (sourceFile.startsWith(".cursor/")) return "Cursor";
  if (sourceFile.startsWith(".vscode/")) return "VS Code";
  if (sourceFile.startsWith(".gemini/")) return "Gemini CLI";
  if (sourceFile === "package.json" || sourceFile === "requirements.txt") return "앱 코드";
  return null;
}

function categoryNames(categoryId: string | null, cats: Map<string, Category>): { field: string; sub: string } {
  const c = categoryId ? cats.get(categoryId) : undefined;
  if (!c) return { field: UNSORTED, sub: UNSORTED };
  if (!c.parentId) return { field: c.name, sub: UNSORTED }; // 큰 갈래만 정해진 기술
  return { field: cats.get(c.parentId)?.name ?? UNSORTED, sub: c.name };
}

/** 들어온 지 7일 안이고, 처음 채운 날 뒤에 들어온 것 */
export const isNewTech = (createdAt: string | null, now: Date, newSince?: string) =>
  (daysSince(createdAt, now) ?? Infinity) < NEW_DAYS && (!newSince || (!!createdAt && Date.parse(createdAt) > Date.parse(newSince))); // 글자 비교는 +00:00·Z가 섞이면 틀린다

function baseNode(key: string, name: string, t: CatalogTech | undefined, cats: Map<string, Category>, now: Date, newSince?: string): MapNode {
  const { host, guessed } = hostOf(t?.techKey ?? null, t?.type ?? null, t?.hosts ?? null);
  const grade = t?.grade ?? "unknown";
  return {
    key, name, mine: false, techId: t?.id ?? null, myTechIds: [], projectIds: [], projectNames: [],
    attrs: { ...categoryNames(t?.categoryId ?? null, cats), kind: t ? KIND_KO[t.type] ?? t.type : "모름", host, grade: GRADE_KO[grade], project: "내 프로젝트 아님" },
    hostGuessed: guessed, grade, gradeReason: t?.gradeReason ?? null, collectErrorKind: t?.collectErrorKind ?? null, lastCheckedOkAt: t?.lastCheckedOkAt ?? null,
    oneLiner: t?.oneLiner ?? null, type: t?.type ?? null, hosts: t?.hosts ?? [], repoUrl: t?.repoUrl ?? null,
    lastActivityAt: t?.lastActivityAt ?? null, lastActivityKind: t?.lastActivityKind ?? null,
    stars: num(t?.signals?.stars), weeklyDownloads: num(t?.signals?.weekly_downloads),
    isNew: isNewTech(t?.createdAt ?? null, now, newSince), lonely: false, label: "", nearMine: false, mark: null, catalogGrade: grade,
  };
}

/** 내 기술을 기술마다 하나로 합친다. 등급은 가장 나쁜 것(여러 프로젝트·버전 중), 이름만 추가한 것은 이름으로 합친다 */
function mergeMine(input: MapInput, techById: Map<string, CatalogTech>, cats: Map<string, Category>, now: Date): Map<string, MapNode> {
  const out = new Map<string, MapNode>();
  // "내 프로젝트"로 묶을 때의 값: 이름이 같은 프로젝트가 둘이면 id 앞 4글자로 가르고, 여러 프로젝트에서 쓰는 기술은 "여러 프로젝트"
  const idsByName = new Map<string, Set<string>>();
  for (const m of input.mine) idsByName.set(m.projectName, (idsByName.get(m.projectName) ?? new Set()).add(m.projectId));
  const projectLabel = (n: MapNode) => (n.projectIds.length > 1 ? "여러 프로젝트"
    : (idsByName.get(n.projectNames[0])?.size ?? 0) > 1 ? `${n.projectNames[0]} (${n.projectIds[0].slice(0, 4)})` : n.projectNames[0]);
  const fileHosts = new Map<string, Set<string>>(); // 기술마다 읽은 파일로 안 쓰는 곳
  for (const m of input.mine) {
    const key = m.techId ? `tech:${m.techId}` : `name:${(m.manualName ?? "").trim().toLowerCase()}`;
    const t = m.techId ? techById.get(m.techId) : undefined;
    const n = out.get(key) ?? { ...baseNode(key, t?.name ?? m.manualName ?? "(이름 없음)", t, cats, now, input.newSince), mine: true, grade: m.grade, gradeReason: m.gradeReason, collectErrorKind: null, lastCheckedOkAt: m.lastCheckedOkAt };
    if (GRADE_RANK[m.grade] > GRADE_RANK[n.grade]) Object.assign(n, { grade: m.grade, gradeReason: m.gradeReason });
    n.collectErrorKind = n.collectErrorKind ?? m.collectErrorKind ?? t?.collectErrorKind ?? null;
    n.myTechIds.push(m.id);
    // 카탈로그가 쓰는 곳을 정하지 않았을 때만 읽은 파일로 정한다. 다른 도구 파일에서도 쓰면 "여러 도구"
    const fromFile = hostOfSource(m.sourceFile);
    if (fromFile && (n.hostGuessed || fileHosts.has(key))) {
      const seen = fileHosts.get(key) ?? new Set<string>();
      seen.add(fromFile); fileHosts.set(key, seen);
      n.attrs = { ...n.attrs, host: seen.size > 1 ? "여러 도구" : fromFile }; n.hostGuessed = false;
    }
    if (!n.projectIds.includes(m.projectId)) n.projectIds.push(m.projectId), n.projectNames.push(m.projectName);
    n.attrs = { ...n.attrs, grade: GRADE_KO[n.grade], project: projectLabel(n) };
    out.set(key, n);
  }
  return out;
}

const byName = (a: MapNode, b: MapNode) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : 1);

export function buildTechMap(input: MapInput, now: Date): TechMapModel {
  const cats = new Map(input.categories.map((c) => [c.id, c]));
  const techById = new Map(input.techs.map((t) => [t.id, t]));
  const mine = mergeMine(input, techById, cats, now);
  const nodes = new Map(mine);
  const edges: [string, string][] = [];
  const quotes: Record<string, string> = {};
  for (const { a, b, quote } of input.relations) { // 한 단계만: 적어도 한쪽이 내 기술인 비교군
    const ka = `tech:${a}`, kb = `tech:${b}`;
    if (!mine.has(ka) && !mine.has(kb)) continue;
    for (const [k, id] of [[ka, a], [kb, b]] as const) if (!nodes.has(k) && techById.has(id)) nodes.set(k, baseNode(k, techById.get(id)!.name, techById.get(id), cats, now, input.newSince));
    if (!nodes.has(ka) || !nodes.has(kb)) continue;
    const e: [string, string] = ka < kb ? [ka, kb] : [kb, ka];
    edges.push(e);
    if (quote) quotes[e.join("|")] = quote;
  }
  for (const t of input.techs) if (!nodes.has(`tech:${t.id}`)) nodes.set(`tech:${t.id}`, baseNode(`tech:${t.id}`, t.name, t, cats, now, input.newSince));
  const marks = new Map((input.marks ?? []).map((m) => [`tech:${m.techId}`, m]));
  const linked = new Set(edges.flat());
  const list = [...nodes.values()];
  for (const n of list) {
    n.lonely = n.mine && !linked.has(n.key); n.nearMine = !n.mine && linked.has(n.key);
    n.label = labelOf(n.collectErrorKind, n.lastActivityAt, now); n.mark = marks.get(n.key) ?? null;
  }
  edges.sort((x, y) => (x.join() < y.join() ? -1 : 1));
  return { mode: mine.size ? "mine" : "catalog", nodes: list.sort(byName), edges, quotes };
}
