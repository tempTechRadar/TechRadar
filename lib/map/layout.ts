// 사용자가 고른 묶기 기준으로 레이더 위 제자리(home)를 정하는 순수 함수(같은 입력이면 같은 그림). 시안 docs/wireframes/radar-layout.js와 같은 규칙.
// 가운데 → 고리 1 = 1단계 묶음 → … → 맨 바깥 = 기술. 부채꼴 너비 ∝ √(들어 있는 기술 수), 하위 묶음은 부모 부채꼴을 나눈다.
// 기술이 많으면 바깥 고리를 여러 줄로 쌓는다. 색은 화면이 tokens.css에서 읽도록 토큰 이름으로 준다(테마를 바꾸면 같이 바뀜).
import { NO_GRADE, UNSORTED, type MapNode, type TechMapModel } from "./build-map.ts";
import { groupOf, passes, type Dim, type ViewConfig } from "./view-config.ts";

export const OTHER = "그 밖";
/** 고리 간격: 1단계 묶음 고리 반지름과 단계 사이 거리(그리기의 고리도 같은 값) */
export const FIRST_RING = 110, LEVEL_GAP = 95;
const LEAF_GAP = 15, ROW_GAP = 16;
const HUB_R = [0, 22, 15, 10]; // 단계마다 크기·모양: 1 육각 · 2 마름모 · 3 네모
/** 색 기준이 보안 등급이면 뜻이 정해진 색(범주 색을 주면 "위험 = 초록"처럼 거꾸로 읽힌다) */
export const GRADE_TOKENS: Record<string, string> = { 위험: "--danger", 주의: "--caution", 통과: "--pass", "찾지 못함": "--unknown", [NO_GRADE]: "--unknown" };
const CATEGORY_TOKENS = 8; // --cat-1 … --cat-8 (옆 묶음끼리 색약에도 구별, dataviz 검사기)

type Base = { id: string; parent: string | null; level: number; x: number; y: number; r: number; token: string | null; hollow: boolean };
export type GroupItem = Base & { type: "g"; dim: Dim; value: string; count: number; mine: number; danger: number; caution: number; err: number };
export type TechItem = Base & { type: "t"; node: MapNode; token: string };
export type Item = GroupItem | TechItem;
export type LegendItem = { value: string; count: number; token: string; rest?: boolean; hollow?: boolean };
export type MapLayout = {
  items: Item[]; byId: Map<string, Item>; edges: [string, string][]; legend: LegendItem[];
  /** 실제로 칠한 기준(들어간 분류로 칠하면 한 색뿐이라 다음 묶기 기준) */ color: Dim;
  depth: number; leafR: number; radius: number; shown: number; total: number;
};

const special = (v: string) => v === UNSORTED || v === OTHER || v === "모름" || v === "찾지 못함" || v === NO_GRADE || v === "내 프로젝트 아님";
const byValue = (a: string, b: string) => (special(a) !== special(b) ? (special(a) ? 1 : -1) : a.localeCompare(b, "ko"));
const byName = (a: MapNode, b: MapNode) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : 1);
const polar = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;

/** 색: 많은 값 8개까지 범주 색, 나머지는 "그 밖"(회색), 분류 전 같은 특별 값은 회색(분류 전은 빈 점) */
function legendOf(nodes: MapNode[], dim: Dim): { legend: LegendItem[]; tokenOf: (v: string) => string } {
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.attrs[dim], (counts.get(n.attrs[dim]) ?? 0) + 1);
  if (dim === "grade") {
    const legend = Object.keys(GRADE_TOKENS).filter((v) => counts.has(v)).map((value) => ({ value, count: counts.get(value)!, token: GRADE_TOKENS[value] }));
    return { legend, tokenOf: (v) => GRADE_TOKENS[v] ?? "--unknown" };
  }
  const ranked = [...counts].filter(([v]) => !special(v)).sort((a, b) => b[1] - a[1] || byValue(a[0], b[0]));
  const colored = new Map(ranked.slice(0, CATEGORY_TOKENS).map(([v], i) => [v, `--cat-${i + 1}`]));
  const legend: LegendItem[] = ranked.slice(0, CATEGORY_TOKENS).map(([value, count]) => ({ value, count, token: colored.get(value)! }));
  const rest = ranked.slice(CATEGORY_TOKENS).reduce((s, [, c]) => s + c, 0);
  if (rest) legend.push({ value: OTHER, count: rest, token: "--unknown", rest: true });
  for (const [v, c] of counts) if (special(v)) legend.push({ value: v, count: c, token: "--unknown", hollow: v === UNSORTED });
  return { legend, tokenOf: (v) => colored.get(v) ?? "--unknown" };
}

/** 프로젝트 필터: 비교군은 프로젝트가 없으니 그 프로젝트의 내 기술에 이어진 것만 남긴다(한 단계, IA-Q5) */
function keptNodes(model: TechMapModel, view: ViewConfig): MapNode[] {
  const project = view.filter.project;
  if (!project) return model.nodes.filter((n) => passes(n, view));
  const mineIn = new Set(model.nodes.filter((n) => n.mine && n.projectIds.includes(project)).map((n) => n.key));
  const near = new Set(model.edges.filter(([a, b]) => mineIn.has(a) || mineIn.has(b)).flat());
  const noProject = { ...view, filter: { ...view.filter, project: "" } };
  return model.nodes.filter((n) => (n.nearMine ? near.has(n.key) && passes(n, noProject) : passes(n, view)));
}

export function layoutMap(model: TechMapModel, view: ViewConfig): MapLayout {
  const kept = keptNodes(model, view);
  const group = groupOf(view);
  const color = view.scope.some((s) => s.dim === view.color) ? group[0] ?? "grade" : view.color;
  const { legend, tokenOf } = legendOf(kept, color);
  const items: Item[] = [], depth = group.length, leafR = FIRST_RING + depth * LEVEL_GAP + 15;
  let maxR = leafR;

  function place(list: MapNode[], level: number, parent: string | null, a0: number, a1: number) {
    if (level > depth) {
      const sorted = [...list].sort(byName);
      const cap = Math.max(1, Math.floor(((a1 - a0) * leafR) / LEAF_GAP)), rows = Math.ceil(sorted.length / cap), per = Math.ceil(sorted.length / rows);
      sorted.forEach((n, i) => {
        const row = Math.floor(i / per), inRow = Math.min(per, sorted.length - row * per), col = i - row * per;
        const r = leafR + row * ROW_GAP + (rows === 1 && sorted.length > 1 ? (i % 2) * 18 : 0); // 한 줄이면 번갈아 내밀어 이름표가 덜 겹치게
        const [x, y] = polar(a0 + ((a1 - a0) * (col + 0.5)) / inRow, r), v = n.attrs[color];
        maxR = Math.max(maxR, r);
        items.push({ type: "t", id: n.key, node: n, parent, level, x, y, r: n.mine ? 6 : 4.5, token: tokenOf(v), hollow: v === UNSORTED });
      });
      return;
    }
    const dim = group[level - 1], buckets = new Map<string, MapNode[]>();
    for (const n of list) buckets.set(n.attrs[dim], [...(buckets.get(n.attrs[dim]) ?? []), n]);
    const keys = [...buckets.keys()].sort(byValue), weight = (k: string) => Math.max(1, Math.sqrt(buckets.get(k)!.length));
    const total = keys.reduce((s, k) => s + weight(k), 0), pad = level === 1 && keys.length > 1 ? 0.04 : 0;
    let start = a0;
    for (const k of keys) {
      const span = ((a1 - a0) * weight(k)) / total, inner = buckets.get(k)!, id = `${parent ? parent + " / " : ""}${dim}=${k}`;
      const [x, y] = polar(start + span / 2, FIRST_RING + (level - 1) * LEVEL_GAP);
      items.push({
        type: "g", id, level, dim, value: k, parent, x, y, r: HUB_R[level], count: inner.length,
        mine: inner.filter((n) => n.mine).length, danger: inner.filter((n) => n.grade === "danger").length,
        caution: inner.filter((n) => n.grade === "caution").length, err: inner.filter((n) => n.collectErrorKind).length,
        token: dim === color ? tokenOf(k) : null, hollow: k === UNSORTED,
      });
      place(inner, level + 1, id, start + span * pad, start + span * (1 - pad));
      start += span;
    }
  }
  place(kept, 1, null, -Math.PI / 2, (3 * Math.PI) / 2);
  const byId = new Map(items.map((it) => [it.id, it]));
  return {
    items, byId, legend, color, depth, leafR, radius: maxR + 30, shown: kept.length, total: model.nodes.length,
    edges: model.edges.filter(([a, b]) => byId.has(a) && byId.has(b)),
  };
}

export function isUnder(L: MapLayout, it: Item, gid: string): boolean {
  for (let p = it.parent; p; p = L.byId.get(p)?.parent ?? null) if (p === gid) return true;
  return false;
}

/** 올린·고른 것과 이어진 것: 묶음이면 위로 가는 길 + 그 아래 전부, 기술이면 위로 가는 길 + 비교군 */
export function connected(L: MapLayout, id: string): Set<string> {
  const out = new Set([id]), it = L.byId.get(id);
  if (!it) return out;
  for (let p = it.parent; p; p = L.byId.get(p)?.parent ?? null) out.add(p);
  if (it.type === "g") { for (const x of L.items) if (isUnder(L, x, id)) out.add(x.id); }
  else for (const [a, b] of L.edges) { if (a === id) out.add(b); if (b === id) out.add(a); }
  return out;
}

/** 접은 묶음 아래에 있어 안 보이는 것 */
export const hiddenOf = (L: MapLayout, collapsed: Set<string>) =>
  new Set(L.items.filter((it) => [...collapsed].some((g) => isUnder(L, it, g))).map((it) => it.id));

/** 처음 펼침: 기술이 많으면(400 넘게) 맨 안쪽 묶음 단계를 접어 둔다 */
export const defaultCollapsed = (L: MapLayout) =>
  new Set(L.shown > 400 ? L.items.filter((it) => it.type === "g" && it.level === L.depth).map((it) => it.id) : []);
