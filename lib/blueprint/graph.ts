// 청사진 그래프 v2(P-12e): 자유 캔버스의 단계(노드) + 연결선(순서). DB · 화면(xyflow) · 서버를 모르는 순수 함수만 둔다.
// 순서는 연결선이 정한다: 깊이 = 들어오는 선이 없는 단계에서 가장 긴 경로(0부터), 깊이가 같으면 동시. 위치(x, y)는 순서와 무관.
// 저장 모양: { v: 2, stages: [{ id, name, x, y, techs: [{ id, name }] }], edges: [{ from, to }], links?: [{ from, to }] } — blueprints.graph 칸(M1).
// links(P-12j H2) = 기술 관계선: 사용자가 그은 표시일 뿐 검증 · 호환 확인이 아니다(계획 데이터 정직성 규칙 1). 끝 = "기술id@단계id", 비면 키를 두지 않는다.
// 기존 board 칸은 지우지 않고 toBoardView로 투영해 둔다 → 이력 · usageOf · exportText · parseBoard는 그대로 쓴다.
// 모든 바꾸기는 새 그래프를 돌려준다(되돌리기 = 전 그래프를 그대로 다시 쓰기). 못 바꾸면 같은 그래프(===)를 돌려준다.
//
// 함수 목록(이름 · 서명):
//   읽기
//     layers(g): Layers                                   깊이 계산(사이클이면 고리를 돌려줌)
//     toBoardView(g): Board | null                        깊이마다 열 하나, 같은 깊이는 y → x → id 순. 사이클이면 null
//     limitProblems(g): string[]                          확정 조건 어긋남(깊이 · 같은 깊이 · 단계 · 기술 · 연결 · 고리). 빈 배열이면 확정 가능
//     wouldCycle(g, from, to): boolean                    from → to를 이으면 고리가 생기는가(자기 자신 포함)
//     connectProblem(g, from, to): ConnectProblem | null  이을 수 없는 이유(null이면 이을 수 있음)
//     nearestLink(g, id, reach?, sizeOf?): Link | null    끄는 단계 가까이의 "붙을 자리"(이미 이어진 짝은 건너뜀, blocked면 빨간 점선)
//     snap(rect, others, reach?): Snapped                 8px 격자 + 다른 단계와 왼쪽 · 가운데 · 오른쪽(위 · 가운데 · 아래) 정렬 보조선
//   바꾸기
//     createStage(name, x, y, techs?): Stage              새 단계(id 새로)
//     addStage(g, stage): Graph                           단계 더하기(48개 · 이름 1~20자)
//     removeStage(g, id): Graph                           단계와 그 연결선 지움
//     renameStage(g, id, name): Graph
//     moveStages(g, to: Map<id, Pos>): Graph              절대 위치로(여러 개 끌기도 한 번에)
//     connect(g, from, to): Graph                         connectProblem이 null일 때만
//     disconnect(g, from, to): Graph
//     putTech(g, stageId, tech): Graph                    같은 기술은 한 번, 단계마다 8개까지(위험 등급 막기는 서버 · 서랍)
//     removeTech(g, stageId, techId): Graph               그 기술 끝의 관계선도 지움(removeStage도 같음)
//     moveTechInStage(g, stageId, techId, to): Graph     단계 안 기술 순서 바꾸기(to = 새 자리, 끝을 넘으면 맨 끝)
//     addLink(g, from, to) · removeLink(g, from, to)     기술 관계선 긋기 · 끊기(끝 = linkEnd(techId, stageId), cleanLinks 규칙)
//     cleanLinks(g, raw): TechLink[]                      없는 기술 · 자기 자신 · 겹침을 빼고 앞에서 100개(DB 202611232200도 같은 규칙)
//     autoLayout(g): Graph                                깊이마다 열, 같은 깊이는 지금 y 순서 유지, 열은 가운데 맞춤(사이클이면 그대로)
//   바꿔 읽기
//     fromV1(board): Graph                                옛 열 · 행 판 → 그래프(이웃한 열의 모든 짝을 잇는다)
//     parseGraph(raw): ParsedGraph                        확정 · 서버가 읽는 값 검사(경계): 모양 · id · 연결선 · 개수 · 고리 + 깊이 · 같은 깊이. 기술 name은 믿지 않음(서버가 DB에서 다시 읽음)
//     parseDraft(raw): ParsedGraph                        브라우저 초안 읽기: parseGraph에서 깊이 · 같은 깊이를 뺀 것, 단계 0개도 받음(편집으로 갈 수 있는 판을 버리지 않으려고)
//     asFrame(g): Graph                                   틀: 단계와 연결만(기술 뺌)
//     applyTemplate(t, kind): Graph                       틀 · 조합 적용(단계 id를 새로 매김)
//   한도는 확정 조건이라 편집 중에는 막지 않는다(깊이 · 같은 깊이는 limitProblems가 알림). 편집 함수가 막는 것은 단계 48 · 기술 8 · 연결 200 · 고리 · 자기 연결 · 겹친 연결.
import { cleanName, MAX_TECHS, newStage, STAGE_NAME_MAX, type Board, type BlueprintTech, type Stage as BoardStage } from "./board.ts";
import { cleanSections, keepSections, withSections, type Section } from "./sections.ts";
import { isUuid } from "../domain/my-tech-view.ts";

export type { BlueprintTech };
export type Pos = { x: number; y: number };
export type Size = { w: number; h: number };
export type Rect = Pos & Size;
/** 판의 단계(id · 이름 · 기술)에 캔버스 위치를 더한 것. x · y는 화면 좌표(px, 정수) */
export type Stage = BoardStage & Pos;
/** from → to: from이 끝나야 to를 시작한다 */
export type Edge = { from: string; to: string };
export type TechLink = { from: string; to: string };
export type Graph = { v: 2; stages: Stage[]; edges: Edge[]; links?: TechLink[]; /** 섹션(P-12o 2단계, sections.ts) */ sections?: Section[] };

/** 확정 조건(서버 · DB 함수 blueprint_graph_clean과 같은 값). 단계 이름 1~20자 · id 1~64자는 parseGraph가 본다 */
export const LIMITS = { depth: 12, parallel: 4, stages: 48, techs: MAX_TECHS, edges: 200, links: 100 } as const;
export const STAGE_ID_MAX = 64;
/** ASCII만: DB(COLLATE "C" 바이트 순)와 JS 글자 순이 같아지는 모양(같은 깊이 정렬의 마지막 기준이 id) */
const STAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** 화면 좌표 한도(이 밖은 잘못 온 값) */
export const COORD_MAX = 100000;

/** 깊이 계산 결과: levels[d] = 깊이 d의 단계 id(y → x → id 순). 사이클이면 cycle = 고리를 이루는 단계 id(연결 방향 순서) */
export type Layers = { ok: true; depth: Map<string, number>; levels: string[][] } | { ok: false; cycle: string[] };
export type ConnectProblem = "self" | "missing" | "exists" | "cycle" | "limit";
export type Link = { from: string; to: string; blocked: ConnectProblem | null };
export type Guide = { axis: "x" | "y"; at: number };
export type Snapped = Pos & { guides: Guide[] };
export type ParsedGraph = { ok: true; graph: Graph } | { ok: false; message: string };
export type TemplateKind = "frame" | "combo";

export const emptyGraph = (): Graph => ({ v: 2, stages: [], edges: [] });

// ── 읽기 ───────────────────────────────────────────────────────────────────────────────────────────
const byPlace = (a: Stage, b: Stage) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const has = (g: Graph, id: string) => g.stages.some((s) => s.id === id);

/** 안 풀린 단계에서 거꾸로(들어오는 선을 따라) 걸으면 반드시 고리에 닿는다. 연결 방향 순서로 돌려준다 */
function ringOf(g: Graph, done: Set<string>): string[] {
  const path: string[] = [];
  const at = new Map<string, number>();
  let cur = g.stages.find((s) => !done.has(s.id))!.id;
  while (!at.has(cur)) {
    at.set(cur, path.length);
    path.push(cur);
    cur = g.edges.find((e) => e.to === cur && !done.has(e.from))!.from;
  }
  return path.slice(at.get(cur)!).reverse();
}

/** 깊이 = 들어오는 선이 없는 단계에서 가장 긴 경로(0부터). 같은 깊이 안은 y → x → id 순. 없는 단계를 가리키는 선은 건너뜀(parseGraph가 거절) */
export function layers(g: Graph): Layers {
  const indeg = new Map(g.stages.map((s) => [s.id, 0]));
  const edges = g.edges.filter((e) => has(g, e.from) && has(g, e.to));
  for (const e of edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const depth = new Map<string, number>();
  const queue = g.stages.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  for (const id of queue) depth.set(id, 0);
  for (let i = 0; i < queue.length; i++) {
    for (const e of edges.filter((x) => x.from === queue[i])) {
      depth.set(e.to, Math.max(depth.get(e.to) ?? 0, depth.get(queue[i])! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  if (queue.length < g.stages.length) return { ok: false, cycle: ringOf({ ...g, edges }, new Set(queue)) };
  const levels: string[][] = [];
  for (const s of [...g.stages].sort(byPlace)) (levels[depth.get(s.id)!] ??= []).push(s.id);
  return { ok: true, depth, levels };
}

/** 내보내기 · 이력이 읽는 열 · 행 판: 깊이마다 열 하나. 고리가 있으면 null(편집 함수는 고리를 만들지 않으니 parseGraph를 거치지 않은 값일 때만) */
export function toBoardView(g: Graph): Board | null {
  const l = layers(g);
  if (!l.ok) return null;
  const by = new Map(g.stages.map((s) => [s.id, s]));
  return l.levels.map((col) => col.map((id) => { const s = by.get(id)!; return { id, name: s.name, techs: [...s.techs], ...(s.note ? { note: s.note } : {}) }; }));
}

const cycleText = (g: Graph, cycle: string[]) => {
  const names = cycle.map((id) => g.stages.find((s) => s.id === id)!.name);
  return `연결이 고리를 이뤄요: ${[...names, names[0]].join(" → ")}`;
};

/** 확정 조건에서 어긋난 곳(사람이 읽는 문장). 빈 배열이면 확정할 수 있다. 단계가 하나도 없는 것은 parseGraph가 본다 */
export function limitProblems(g: Graph): string[] {
  const out: string[] = [];
  if (g.stages.length > LIMITS.stages) out.push(`단계는 ${LIMITS.stages}개까지예요(지금 ${g.stages.length}개).`);
  if (g.edges.length > LIMITS.edges) out.push(`연결선은 ${LIMITS.edges}개까지예요(지금 ${g.edges.length}개).`);
  for (const s of g.stages) if (s.techs.length > LIMITS.techs) out.push(`"${s.name}" 단계의 기술이 ${s.techs.length}개예요(${LIMITS.techs}개까지).`);
  const l = layers(g);
  if (!l.ok) return [...out, cycleText(g, l.cycle)];
  if (l.levels.length > LIMITS.depth) out.push(`순서가 ${l.levels.length}단계예요(${LIMITS.depth}단계까지).`);
  l.levels.forEach((col, d) => { if (col.length > LIMITS.parallel) out.push(`${d + 1}번째 순서에 단계가 ${col.length}개예요(동시에 ${LIMITS.parallel}개까지).`); });
  return out;
}

/** from → to를 이으면 고리가 생기는가: to에서 앞으로 가다 from에 닿으면 생긴다(자기 자신 연결도 고리) */
export function wouldCycle(g: Graph, from: string, to: string): boolean {
  if (from === to) return true;
  const seen = new Set([to]);
  const stack = [to];
  while (stack.length) {
    const u = stack.pop()!;
    for (const e of g.edges) {
      if (e.from !== u || seen.has(e.to)) continue;
      if (e.to === from) return true;
      seen.add(e.to);
      stack.push(e.to);
    }
  }
  return false;
}

/** 못 잇는 이유(null이면 이을 수 있음). 반대 방향 선이 이미 있으면 이으면 고리라서 "cycle" */
export function connectProblem(g: Graph, from: string, to: string): ConnectProblem | null {
  if (from === to) return "self";
  if (!has(g, from) || !has(g, to)) return "missing";
  if (g.edges.some((e) => e.from === from && e.to === to)) return "exists";
  if (wouldCycle(g, from, to)) return "cycle";
  return g.edges.length >= LIMITS.edges ? "limit" : null;
}

/** 놓을 때 8px 격자, 다른 단계와 가장자리 · 가운데가 reach(px) 안이면 그 선에 붙는다(축마다 가장 가까운 선 하나가 보조선) */
export const GRID = 8;
export const GUIDE_REACH = 6;
const anchors = (start: number, len: number) => [start, start + len / 2, start + len];
function snapAxis(start: number, len: number, others: [number, number][], reach: number): { at: number; guide: number | null } {
  const targets = others.flatMap(([s, l]) => anchors(s, l));
  let best: { d: number; guide: number } | null = null;
  for (const m of anchors(start, len)) for (const t of targets) {
    if (Math.abs(t - m) <= reach && (!best || Math.abs(t - m) < Math.abs(best.d))) best = { d: t - m, guide: t };
  }
  return best ? { at: Math.round(start + best.d), guide: best.guide } : { at: Math.round(start / GRID) * GRID, guide: null };
}
export function snap(r: Rect, others: Rect[], reach = GUIDE_REACH): Snapped {
  const sx = snapAxis(r.x, r.w, others.map((o) => [o.x, o.w]), reach);
  const sy = snapAxis(r.y, r.h, others.map((o) => [o.y, o.h]), reach);
  const guides: Guide[] = [];
  if (sx.guide !== null) guides.push({ axis: "x", at: sx.guide });
  if (sy.guide !== null) guides.push({ axis: "y", at: sy.guide });
  return { x: sx.at, y: sy.at, guides };
}

/** 단계 크기는 화면이 잰다(sizeOf로 넘김). 못 재면 이 값 */
export const NODE_SIZE: Size = { w: 208, h: 112 }; // P-12j(11-22 사용자): 글자는 크게 · 폭과 간격은 좁게 → 1440 화면에 단계 6개가 0.9배 이상
/** 붙을 자리를 보여 주는 가장자리 사이 거리(px) */
export const LINK_REACH = 160;
const edgeGap = (a: Rect, b: Rect) =>
  Math.hypot(Math.max(0, Math.abs(a.x + a.w / 2 - b.x - b.w / 2) - (a.w + b.w) / 2), Math.max(0, Math.abs(a.y + a.h / 2 - b.y - b.h / 2) - (a.h + b.h) / 2));
/** id를 끌 때 reach 안에서 가장 가까운, 아직 안 이어진 단계와의 연결 후보. 왼쪽(같은 열이면 위쪽)이 앞단계. blocked면 빨간 점선으로 보여 주고 놓아도 안 이어진다 */
export function nearestLink(g: Graph, id: string, reach = LINK_REACH, sizeOf: (s: Stage) => Size = () => NODE_SIZE): Link | null {
  const me = g.stages.find((s) => s.id === id);
  if (!me) return null;
  const rect = (s: Stage): Rect => ({ x: s.x, y: s.y, ...sizeOf(s) });
  const linked = (o: Stage) => g.edges.some((e) => (e.from === id && e.to === o.id) || (e.to === id && e.from === o.id));
  let best: { o: Stage; d: number } | null = null;
  for (const o of g.stages) {
    if (o.id === id || linked(o)) continue;
    const d = edgeGap(rect(me), rect(o));
    if (d <= reach && (!best || d < best.d)) best = { o, d };
  }
  if (!best) return null;
  const [mx, ox] = [me.x + rect(me).w / 2, best.o.x + rect(best.o).w / 2];
  const otherFirst = ox < mx || (ox === mx && best.o.y < me.y);
  const [from, to] = otherFirst ? [best.o.id, id] : [id, best.o.id];
  return { from, to, blocked: connectProblem(g, from, to) };
}

// ── 바꾸기 ─────────────────────────────────────────────────────────────────────────────────────────
const clampPos = (n: number) => Math.max(-COORD_MAX, Math.min(COORD_MAX, Math.round(n)));
export const createStage = (name: string, x: number, y: number, techs: BlueprintTech[] = []): Stage => ({ ...newStage(name, techs), x: clampPos(x), y: clampPos(y) });
function mapStage(g: Graph, id: string, f: (s: Stage) => Stage): Graph {
  const stages = g.stages.map((s) => (s.id === id ? f(s) : s));
  return stages.some((s, i) => s !== g.stages[i]) ? { ...g, stages } : g;
}

export function addStage(g: Graph, stage: Stage): Graph {
  if (g.stages.length >= LIMITS.stages || !cleanName(stage.name) || has(g, stage.id)) return g;
  return { ...g, stages: [...g.stages, { ...stage, name: cleanName(stage.name) }] };
}
export const removeStage = (g: Graph, id: string): Graph => (has(g, id) ? keepLinks({ ...g, stages: g.stages.filter((s) => s.id !== id), edges: g.edges.filter((e) => e.from !== id && e.to !== id) }) : g);
export const renameStage = (g: Graph, id: string, name: string): Graph => (cleanName(name) ? mapStage(g, id, (s) => ({ ...s, name: cleanName(name) })) : g);

/** 절대 위치로 옮긴다(여러 개 끌기도 한 번에). 바뀐 곳이 없으면 같은 그래프 */
export function moveStages(g: Graph, to: Map<string, Pos>): Graph {
  const moved = g.stages.map((s) => {
    const p = to.get(s.id);
    return p && (clampPos(p.x) !== s.x || clampPos(p.y) !== s.y) ? { ...s, x: clampPos(p.x), y: clampPos(p.y) } : s;
  });
  return moved.some((s, i) => s !== g.stages[i]) ? { ...g, stages: moved } : g;
}

export const connect = (g: Graph, from: string, to: string): Graph => (connectProblem(g, from, to) ? g : { ...g, edges: [...g.edges, { from, to }] });
export function disconnect(g: Graph, from: string, to: string): Graph {
  const edges = g.edges.filter((e) => !(e.from === from && e.to === to));
  return edges.length === g.edges.length ? g : { ...g, edges };
}

/** 기술 붙이기: 같은 기술은 한 번, 단계마다 최대 8개. 위험 등급 막기는 부르는 쪽(서랍 · 서버)이 한다 */
export const putTech = (g: Graph, id: string, tech: BlueprintTech): Graph =>
  mapStage(g, id, (s) => (s.techs.some((t) => t.id === tech.id) || s.techs.length >= LIMITS.techs ? s : { ...s, techs: [...s.techs, tech] }));
/** 단계 메모(P-12h-2 T2): 200자 · 앞뒤 공백 없앰, 비면 키를 지움. DB(202611232000 blueprint_graph_clean)도 같은 규칙 */
export const STAGE_NOTE_MAX = 200;
export const cleanNote = (v: unknown): string => (typeof v === "string" ? v.trim().slice(0, STAGE_NOTE_MAX).trim() : "");
export function setStageNote(g: Graph, id: string, note: string): Graph {
  const n = cleanNote(note);
  return mapStage(g, id, (s) => {
    if ((s.note ?? "") === n) return s;
    const { note: _old, ...rest } = s;
    return n ? { ...rest, note: n } : rest;
  });
}
export function removeTech(g: Graph, id: string, techId: string): Graph {
  const next = mapStage(g, id, (s) => (s.techs.some((t) => t.id === techId) ? { ...s, techs: s.techs.filter((t) => t.id !== techId) } : s));
  return next === g ? g : keepLinks(next);
}
/** 단계 안 기술 순서 바꾸기(P-12j H2): to = 새 자리(0부터, 넘으면 맨 끝). 자리가 그대로면 같은 그래프 */
export function moveTechInStage(g: Graph, id: string, techId: string, to: number): Graph {
  return mapStage(g, id, (s) => {
    const from = s.techs.findIndex((t) => t.id === techId), at = Math.max(0, Math.min(s.techs.length - 1, Math.trunc(to)));
    if (from < 0 || from === at) return s;
    const techs = s.techs.filter((t) => t.id !== techId);
    techs.splice(at, 0, s.techs[from]);
    return { ...s, techs };
  });
}

// ── 기술 관계선(P-12j H2): 사용자가 그은 표시. "검증 · 호환"이 아니다 ───────────────────────────────────
export const linkEnd = (techId: string, stageId: string): string => `${techId}@${stageId}`;
const ends = (g: Graph) => new Set(g.stages.flatMap((s) => s.techs.map((t) => linkEnd(t.id, s.id))));
/** 없는 기술 · 자기 자신 · 겹친 선 · 모양이 틀린 것을 빼고 앞에서 100개. 판을 버리지 않으려고 막지 않고 뺀다(DB도 같음) */
export function cleanLinks(g: Graph, raw: unknown): TechLink[] {
  if (!Array.isArray(raw)) return [];
  const ok = ends(g), seen = new Set<string>(), out: TechLink[] = [];
  for (const l of raw as { from?: unknown; to?: unknown }[]) {
    const { from, to } = l ?? {};
    if (out.length >= LIMITS.links) break;
    if (typeof from !== "string" || typeof to !== "string" || from === to || !ok.has(from) || !ok.has(to) || seen.has(`${from}\n${to}`)) continue;
    seen.add(`${from}\n${to}`);
    out.push({ from, to });
  }
  return out;
}
/** links를 정리해 다시 단다(비면 키를 지움) */
function withLinks(g: Graph, links: TechLink[]): Graph {
  const { links: _old, ...rest } = g;
  return links.length ? { ...rest, links } : rest;
}
/** 관계선을 정리해 다시 단다(단계 · 기술을 바꾼 뒤 부르는 쪽용) */
export const setLinks = (g: Graph, raw: unknown): Graph => withLinks(g, cleanLinks(g, raw));
const keepLinks = (g: Graph): Graph => keepSections(g.links ? setLinks(g, g.links) : g); // 섹션도 함께(없어진 단계를 빼고 2개 미만이면 품)
/** 관계선 긋기: 정리 규칙에 걸리면(없는 끝 · 자기 자신 · 이미 있음 · 100개) 같은 그래프 */
export function addLink(g: Graph, from: string, to: string): Graph {
  const links = cleanLinks(g, [...(g.links ?? []), { from, to }]);
  return links.length === (g.links?.length ?? 0) ? g : withLinks(g, links);
}
export function removeLink(g: Graph, from: string, to: string): Graph {
  const links = (g.links ?? []).filter((l) => !(l.from === from && l.to === to));
  return links.length === (g.links?.length ?? 0) ? g : withLinks(g, links);
}

/** 깊이마다 열(x), 같은 깊이는 지금 y 순서대로 쌓고 열마다 가운데 맞춤. 모든 값이 8의 배수.
 *  P-12h-2 T1: 카드를 키워 320 · 160 → 384 · 192. DB의 v1 → v2 변환(SQL 202611221000)은 옛 값 그대로 둔다(이미 바뀐 판을 다시 옮기지 않게) */
export const LAYOUT = { x: 248, y: 160 } as const; // 열 사이 40(폭 208). 같은 열은 상자 높이 + 32, 적어도 160
/** 단계 = 컨테이너(P-12j H2): 머리 아래 기술 노드가 한 줄에 하나씩. 화면(stage-node · tech-node CSS)이 같은 값을 쓴다 */
export const BOX = { head: 48, row: 54, pad: 12, note: 40, tech: { x: 10, w: NODE_SIZE.w - 20, h: 48 } } as const;
/** 단계 상자 높이: 기술이 없어도 한 줄(놓을 자리 안내), 메모가 있으면 두 줄 더 */
export const stageHeight = (s: Pick<Stage, "techs" | "note">): number => BOX.head + Math.max(1, s.techs.length) * BOX.row + BOX.pad + (s.note ? BOX.note : 0);
/** 단계 안 i번째 기술 노드 자리(단계 왼쪽 위 기준) */
export const techSlot = (i: number): Pos => ({ x: BOX.tech.x, y: BOX.head + i * BOX.row });
/** 단계 안 y(단계 기준)에 놓으면 몇 번째 자리인지(0 ~ n) */
export const slotAt = (y: number, n: number): number => Math.max(0, Math.min(n, Math.round((y - BOX.head) / BOX.row)));
/** 깊이마다 열. 같은 열은 상자 높이만큼 쌓되(사이 32) 적어도 LAYOUT.y 칸, 열마다 가운데 맞춤. 모든 값이 8의 배수 */
function placeLevels(levels: string[][], heightOf: (id: string) => number): Map<string, Pos> {
  const step = (id: string) => Math.max(LAYOUT.y, Math.ceil((heightOf(id) + 32) / GRID) * GRID);
  const total = (col: string[]) => col.reduce((n, id) => n + step(id), 0);
  const tallest = Math.max(0, ...levels.map(total));
  const at = new Map<string, Pos>();
  levels.forEach((col, d) => {
    let y = (tallest - total(col)) / 2;
    for (const id of col) { at.set(id, { x: d * LAYOUT.x, y: Math.round(y / GRID) * GRID }); y += step(id); }
  });
  return at;
}
export function autoLayout(g: Graph): Graph {
  const l = layers(g);
  const h = new Map(g.stages.map((s) => [s.id, stageHeight(s)]));
  return l.ok ? moveStages(g, placeLevels(l.levels, (id) => h.get(id) ?? 0)) : g;
}

// ── 바꿔 읽기 ──────────────────────────────────────────────────────────────────────────────────────
/** 옛 열 · 행 판 → 그래프. 이웃한 열의 모든 짝을 잇는다(열 12 × 나란히 4면 최대 176줄이라 한도 안). 읽으면 toBoardView가 같은 판을 돌려준다 */
export function fromV1(board: Board): Graph {
  const cols = board.filter((c) => c.length > 0);
  const h = new Map(cols.flat().map((s) => [s.id, stageHeight(s)]));
  const at = placeLevels(cols.map((c) => c.map((s) => s.id)), (id) => h.get(id) ?? 0);
  const stages = cols.flat().map((s) => ({ ...s, techs: [...s.techs], ...at.get(s.id)! }));
  const edges = cols.slice(1).flatMap((col, i) => cols[i].flatMap((a) => col.map((b) => ({ from: a.id, to: b.id }))));
  return { v: 2, stages, edges };
}

/** 틀: 단계와 연결만(기술 뺌 → 관계선도 빠짐) */
export const asFrame = (g: Graph): Graph => withLinks({ ...g, stages: g.stages.map((s) => ({ ...s, techs: [] })) }, []);
/** 템플릿 적용: 단계 id를 새로 매겨 돌려준다(두 번 적용해도 겹치지 않게). 틀은 기술을 뺀다. 검사는 서버가 이미 한 템플릿이 전제 */
export function applyTemplate(t: Graph, kind: TemplateKind): Graph {
  const src = kind === "frame" ? asFrame(t) : t;
  const fresh = new Map(src.stages.map((s) => [s.id, newStage(s.name).id]));
  const reEnd = (end: string) => { const at = end.lastIndexOf("@"); return `${end.slice(0, at)}@${fresh.get(end.slice(at + 1)) ?? ""}`; };
  const g: Graph = {
    v: 2,
    stages: src.stages.map((s) => ({ ...s, id: fresh.get(s.id)!, techs: [...s.techs] })),
    edges: src.edges.filter((e) => fresh.has(e.from) && fresh.has(e.to)).map((e) => ({ from: fresh.get(e.from)!, to: fresh.get(e.to)! })),
  };
  return withLinks(g, cleanLinks(g, (src.links ?? []).map((l) => ({ from: reEnd(l.from), to: reEnd(l.to) }))));
}

const bad = (message: string): ParsedGraph => ({ ok: false, message });
type StageIn = { id?: unknown; name?: unknown; x?: unknown; y?: unknown; techs?: unknown; note?: unknown };
function parseStage(s: unknown, seen: Set<string>): Stage | string {
  const v = (s ?? {}) as StageIn;
  if (typeof v.id !== "string" || !STAGE_ID.test(v.id)) return `단계 id는 1~${STAGE_ID_MAX}자의 영문·숫자·_·-여야 해요.`;
  if (seen.has(v.id)) return "단계 id가 겹쳐요.";
  const name = typeof v.name === "string" ? v.name.trim() : "";
  if (!name || name.length > STAGE_NAME_MAX) return `단계 이름은 1~${STAGE_NAME_MAX}자여야 해요.`;
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= COORD_MAX;
  if (!ok(v.x) || !ok(v.y)) return `"${name}" 단계의 위치가 맞지 않아요.`;
  const raw = Array.isArray(v.techs) ? (v.techs as { id?: unknown; name?: unknown }[]) : null;
  if (!raw || raw.length > LIMITS.techs || !raw.every((t) => isUuid(t?.id))) return `"${name}" 단계의 기술이 맞지 않아요(단계마다 ${LIMITS.techs}개까지).`;
  const techs: BlueprintTech[] = [];
  for (const t of raw) if (!techs.some((x) => x.id === t.id)) techs.push({ id: t.id as string, name: typeof t.name === "string" ? t.name.slice(0, 80) : "" });
  const note = cleanNote(v.note); // 메모는 맞지 않아도 판을 버리지 않고 뺀다(글 · 길이만 다름)
  return { id: v.id, name, x: Math.round(v.x), y: Math.round(v.y), techs, ...(note ? { note } : {}) };
}
function parseEdge(e: unknown, ids: Set<string>, seen: Set<string>): Edge | string {
  const { from, to } = (e ?? {}) as { from?: unknown; to?: unknown };
  if (typeof from !== "string" || typeof to !== "string" || !ids.has(from) || !ids.has(to)) return "없는 단계를 잇는 연결선이 있어요.";
  if (from === to) return "자기 자신을 잇는 연결선이 있어요.";
  if (seen.has(`${from}\n${to}`)) return "같은 연결선이 겹쳐요.";
  return { from, to };
}

/** 모양 · id · 연결선 · 개수(단계 48 · 기술 8 · 연결선 200) · 고리. 깊이 · 같은 깊이는 보지 않는다(그건 확정 조건) */
function parseShape(raw: unknown, minStages: number): ParsedGraph {
  const r = (raw ?? {}) as { v?: unknown; stages?: unknown; edges?: unknown; links?: unknown; sections?: unknown };
  if (r.v !== 2 || !Array.isArray(r.stages) || !Array.isArray(r.edges)) return bad("청사진 모양이 맞지 않아요.");
  if (r.stages.length < minStages || r.stages.length > LIMITS.stages) return bad(`단계는 ${minStages}~${LIMITS.stages}개여야 해요.`);
  if (r.edges.length > LIMITS.edges) return bad(`연결선은 ${LIMITS.edges}개까지예요.`);
  const stages: Stage[] = [];
  const ids = new Set<string>();
  for (const s of r.stages) {
    const p = parseStage(s, ids);
    if (typeof p === "string") return bad(p);
    stages.push(p);
    ids.add(p.id);
  }
  const edges: Edge[] = [];
  const pairs = new Set<string>();
  for (const e of r.edges) {
    const p = parseEdge(e, ids, pairs);
    if (typeof p === "string") return bad(p);
    edges.push(p);
    pairs.add(`${p.from}\n${p.to}`);
  }
  const plain: Graph = { v: 2, stages, edges };
  const graph = withSections(withLinks(plain, cleanLinks(plain, r.links)), cleanSections(ids, r.sections)); // 관계선 · 섹션은 맞지 않으면 그것만 뺀다(메모와 같이 판을 버리지 않음)
  const l = layers(graph);
  return l.ok ? { ok: true, graph } : bad(cycleText(graph, l.cycle));
}

/**
 * 확정 · 서버가 읽는 그래프(경계): 모양 · id · 연결선 · 개수 · 고리에 더해 깊이 12 · 같은 깊이 4까지 본다. 단계는 1개 이상.
 * 기술 name은 서버가 DB에서 다시 읽으니 믿지 않는다.
 */
export function parseGraph(raw: unknown): ParsedGraph {
  const p = parseShape(raw, 1);
  if (!p.ok) return p;
  const problems = limitProblems(p.graph);
  return problems.length ? bad(problems[0]) : p;
}

/**
 * 브라우저 초안을 다시 열 때 읽는 그래프: 편집으로 갈 수 있는 판(깊이 13 · 같은 깊이 5 · 단계 0개)은 버리지 않는다. 확정 조건은 limitProblems가 따로 알린다.
 * 이걸 읽은 값을 서버로 보낼 때는 parseGraph(또는 DB 함수)가 다시 본다.
 */
export const parseDraft = (raw: unknown): ParsedGraph => parseShape(raw, 0);
