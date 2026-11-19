// 사용자가 고른 묶기 기준으로 레이더 위 자리를 정하는 순수 함수(같은 입력이면 같은 그림).
// 가운데 "나" → 고리 1 = 1차 묶음 → 고리 2 = 2차 묶음 → … → 맨 바깥 = 기술. 부채꼴 너비는 들어 있는 기술 수의 제곱근에 비례하고,
// 하위 묶음은 부모의 부채꼴을 나눠 쓴다(옛 시안 docs/wireframes/map.js의 hostLayout과 같은 방식).
import { UNSORTED, type MapNode, type TechMapModel } from "./build-map.ts";
import { passes, type Dim, type ViewConfig } from "./view-config.ts";

/** 범주 8색. 옆 묶음끼리 정상 시력 ΔE ≥ 17.5·색약 ≥ 7.6(둘러 붙는 첫·끝 포함, dataviz 검사기). 빨강·호박은 보안 표시에만 쓰려고 뺐다.
 *  모든 짝을 구별할 수는 없어서(8색은 불가능) 이름표·자리(묶음마다 부채꼴)가 늘 함께 간다 */
export const PALETTE = ["#2a78d6", "#1baf7a", "#6250d6", "#008300", "#e87ba4", "#0b7fa0", "#6d7a1f", "#b0479e"];
export const NEUTRAL = "#9aa1ab";
export const OTHER = "그 밖";
/** 색 기준이 보안 등급이면 의미가 정해진 색을 쓴다(위험 빨강·주의 호박, 나머지는 회색 계열). 범주 색을 주면 "위험 = 초록"처럼 거꾸로 읽힌다 */
export const GRADE_COLORS: Record<string, string> = { 위험: "#C0262D", 주의: "#B87600", 통과: "#6f8f76", "찾지 못함": NEUTRAL };

export type GroupNode = { id: string; level: number; dim: Dim; value: string; parent: string | null; x: number; y: number; count: number; mine: number; danger: number; caution: number; color: string | null };
export type Leaf = { node: MapNode; x: number; y: number; parent: string | null; color: string };
export type LegendItem = { value: string; count: number; color: string };
export type MapLayout = { groups: GroupNode[]; leaves: Leaf[]; compareEdges: [string, string][]; radius: number; legend: LegendItem[]; shown: number; total: number };

const SEP = " / "; // 묶음 id 사이 구분. 부모·자식 찾기는 id 글자가 아니라 parent 칸으로 한다
/** 고리 간격: 1차 묶음 고리 반지름과 단계 사이 거리(화면의 레이더 고리도 같은 값을 쓴다) */
export const FIRST_RING = 110, LEVEL_GAP = 95;
const LEAF_STEP = 34;
type Span = { parent: string | null; a0: number; a1: number };
const special = (v: string) => v === UNSORTED || v === OTHER || v === "모름" || v === "내 프로젝트 아님";
const byValue = (a: string, b: string) => (special(a) !== special(b) ? (special(a) ? 1 : -1) : a.localeCompare(b, "ko"));
const polar = (a: number, r: number) => [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)] as const;

/** 프로젝트가 있는 지도에서는 거르기로 남은 내 기술에 이어진 비교군만 남긴다(한 단계, IA-Q5) */
function keptNodes(model: TechMapModel, view: ViewConfig): MapNode[] {
  const pass = model.nodes.filter((n) => passes(n, n.mine ? view.filter : { ...view.filter, project: "" })); // 비교군은 프로젝트가 없다: 이어진 내 기술로 남긴다
  if (model.mode === "catalog") return pass;
  // 비교군이 붙는 내 기술은 프로젝트 거르기만 따른다(위험만·종류 같은 거르기는 비교군 자신에게 건다: 위험한 비교군도 보이게)
  const mine = new Set(model.nodes.filter((n) => n.mine && (!view.filter.project || n.projectIds.includes(view.filter.project))).map((n) => n.key));
  const near = new Set(model.edges.filter(([a, b]) => mine.has(a) || mine.has(b)).flat());
  return pass.filter((n) => n.mine || near.has(n.key));
}

/** 색: 색 기준 값을 많은 순으로 8개까지 색을 주고, 나머지는 "그 밖"(회색), 값이 없으면 "분류 전"(회색) */
function legendOf(nodes: MapNode[], dim: Dim): { legend: LegendItem[]; colorOf: (v: string) => string } {
  const counts = new Map<string, number>();
  for (const n of nodes) counts.set(n.attrs[dim], (counts.get(n.attrs[dim]) ?? 0) + 1);
  if (dim === "grade") {
    const order = Object.keys(GRADE_COLORS).filter((v) => counts.has(v));
    return { legend: order.map((value) => ({ value, count: counts.get(value)!, color: GRADE_COLORS[value] })), colorOf: (v) => GRADE_COLORS[v] ?? NEUTRAL };
  }
  const ranked = [...counts].filter(([v]) => !special(v)).sort((a, b) => b[1] - a[1] || byValue(a[0], b[0]));
  const colored = new Map(ranked.slice(0, PALETTE.length).map(([v], i) => [v, PALETTE[i]]));
  const legend: LegendItem[] = ranked.slice(0, PALETTE.length).map(([value, count]) => ({ value, count, color: colored.get(value)! }));
  const rest = ranked.slice(PALETTE.length).reduce((s, [, c]) => s + c, 0);
  if (rest) legend.push({ value: OTHER, count: rest, color: NEUTRAL });
  for (const [v, c] of counts) if (special(v)) legend.push({ value: v, count: c, color: NEUTRAL });
  return { legend, colorOf: (v) => colored.get(v) ?? NEUTRAL };
}

export function layoutMap(model: TechMapModel, view: ViewConfig): MapLayout {
  const nodes = keptNodes(model, view);
  const { legend, colorOf } = legendOf(nodes, view.color);
  const groups: GroupNode[] = [], leaves: Leaf[] = [];
  const depth = view.group.length, leafR = FIRST_RING + depth * LEVEL_GAP + (depth ? 15 : 30);

  function place(list: MapNode[], level: number, { parent, a0, a1 }: Span) {
    if (level > depth) {
      const sorted = [...list].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : 1));
      sorted.forEach((n, i) => {
        const a = a0 + ((a1 - a0) * (i + 0.5)) / sorted.length, [x, y] = polar(a, leafR + (sorted.length > 3 ? i % 3 : i % 2) * LEAF_STEP); // 이웃한 이름표가 겹치지 않게 반지름을 번갈아
        leaves.push({ node: n, x, y, parent, color: colorOf(n.attrs[view.color]) });
      });
      return;
    }
    const dim = view.group[level - 1];
    const buckets = new Map<string, MapNode[]>();
    for (const n of list) buckets.set(n.attrs[dim], [...(buckets.get(n.attrs[dim]) ?? []), n]);
    const keys = [...buckets.keys()].sort(byValue);
    const weight = (k: string) => Math.max(1, Math.sqrt(buckets.get(k)!.length));
    const total = keys.reduce((s, k) => s + weight(k), 0), pad = level === 1 && keys.length > 1 ? 0.04 : 0;
    let start = a0;
    for (const k of keys) {
      const span = ((a1 - a0) * weight(k)) / total, inner = buckets.get(k)!, id = `${parent ? parent + SEP : ""}${dim}=${k}`;
      const [x, y] = polar(start + span / 2, FIRST_RING + (level - 1) * LEVEL_GAP);
      groups.push({
        id, level, dim, value: k, parent, x, y, count: inner.length, mine: inner.filter((n) => n.mine).length,
        danger: inner.filter((n) => n.grade === "danger").length, caution: inner.filter((n) => n.grade === "caution").length,
        color: dim === view.color ? colorOf(k) : null,
      });
      place(inner, level + 1, { parent: id, a0: start + span * pad, a1: start + span * (1 - pad) });
      start += span;
    }
  }
  place(nodes, 1, { parent: null, a0: -Math.PI / 2, a1: (3 * Math.PI) / 2 });
  const shownKeys = new Set(nodes.map((n) => n.key));
  return {
    groups, leaves, legend, shown: nodes.length, total: model.nodes.length,
    compareEdges: model.edges.filter(([a, b]) => shownKeys.has(a) && shownKeys.has(b)),
    radius: leafR + 2 * LEAF_STEP + 20,
  };
}

/** 올린·고른 것과 이어진 것: 묶음이면 위로 가는 길 + 그 아래 전부, 기술이면 위로 가는 길 + 비교군 */
export function connected(layout: MapLayout, id: string): Set<string> {
  const parentOf = new Map<string, string | null>([...layout.groups.map((g) => [g.id, g.parent] as const), ...layout.leaves.map((l) => [l.node.key, l.parent] as const)]);
  const out = new Set<string>([id]);
  for (let p = parentOf.get(id) ?? null; p; p = parentOf.get(p) ?? null) out.add(p);
  const isGroup = layout.groups.some((g) => g.id === id);
  const under = (p: string | null): boolean => { for (let q = p; q; q = parentOf.get(q) ?? null) if (q === id) return true; return false; };
  if (isGroup) {
    for (const g of layout.groups) if (under(g.parent)) out.add(g.id);
    for (const l of layout.leaves) if (under(l.parent)) out.add(l.node.key);
  } else {
    for (const [a, b] of layout.compareEdges) if (a === id || b === id) out.add(a === id ? b : a);
  }
  return out;
}
