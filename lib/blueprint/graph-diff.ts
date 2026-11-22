// 확정 전 "지난 확정과 달라진 것"(P-12h-2 T4, Terraform plan처럼): 화면 · DB를 모르는 순수 계산.
// 단계는 id로 먼저 맞추고, 남은 것은 같은 이름끼리 맞춘다(옛 확정본은 board → fromV1이라 id가 새로 생김). 위치는 보지 않는다(확정 내용이 아님).
import type { Graph, Stage } from "./graph.ts";

export type GraphDiff = {
  addedStages: string[]; removedStages: string[]; renamed: { from: string; to: string }[];
  techs: { stage: string; added: string[]; removed: string[] }[]; addedEdges: string[]; removedEdges: string[]; notes: string[];
};

/** next 단계 id → 맞는 prev 단계 */
function match(prev: Graph, next: Graph): Map<string, Stage> {
  const byId = new Map(prev.stages.map((s) => [s.id, s])), used = new Set<string>(), out = new Map<string, Stage>();
  for (const s of next.stages) { const p = byId.get(s.id); if (p) { out.set(s.id, p); used.add(p.id); } }
  for (const s of next.stages) {
    if (out.has(s.id)) continue;
    const p = prev.stages.find((x) => !used.has(x.id) && x.name === s.name);
    if (p) { out.set(s.id, p); used.add(p.id); }
  }
  return out;
}

export function graphDiff(prev: Graph, next: Graph): GraphDiff {
  const m = match(prev, next), matchedPrev = new Set([...m.values()].map((s) => s.id));
  const prevToNext = new Map([...m].map(([n, p]) => [p.id, n]));
  const nameOf = (g: Graph) => new Map(g.stages.map((s) => [s.id, s.name]));
  const pn = nameOf(prev), nn = nameOf(next);
  const d: GraphDiff = { addedStages: [], removedStages: [], renamed: [], techs: [], addedEdges: [], removedEdges: [], notes: [] };
  for (const s of next.stages) {
    const p = m.get(s.id);
    if (!p) { d.addedStages.push(s.name); continue; }
    if (p.name !== s.name) d.renamed.push({ from: p.name, to: s.name });
    const had = new Set(p.techs.map((t) => t.id)), has = new Set(s.techs.map((t) => t.id));
    const added = s.techs.filter((t) => !had.has(t.id)).map((t) => t.name), removed = p.techs.filter((t) => !has.has(t.id)).map((t) => t.name);
    if (added.length || removed.length) d.techs.push({ stage: s.name, added, removed });
    if ((p.note ?? "") !== (s.note ?? "")) d.notes.push(s.name);
  }
  d.removedStages = prev.stages.filter((s) => !matchedPrev.has(s.id)).map((s) => s.name);
  // 선은 맞춘 단계 기준(next id)으로 비교, 글은 단계 이름으로
  const key = (a: string, b: string) => `${a}>${b}`;
  const prevEdges = new Set(prev.edges.flatMap((e) => { const a = prevToNext.get(e.from), b = prevToNext.get(e.to); return a && b ? [key(a, b)] : []; }));
  const nextEdges = new Set(next.edges.map((e) => key(e.from, e.to)));
  for (const e of next.edges) if (!prevEdges.has(key(e.from, e.to))) d.addedEdges.push(`${nn.get(e.from)} → ${nn.get(e.to)}`);
  for (const e of prev.edges) {
    const a = prevToNext.get(e.from), b = prevToNext.get(e.to);
    if (!a || !b || !nextEdges.has(key(a, b))) d.removedEdges.push(`${pn.get(e.from)} → ${pn.get(e.to)}`);
  }
  return d;
}

/** 사람이 읽는 줄. 빈 배열 = 달라진 것 없음 */
export function diffLines(d: GraphDiff): string[] {
  const list = (xs: string[]) => xs.join(", ");
  return [
    ...(d.addedStages.length ? [`단계 더함: ${list(d.addedStages)}`] : []),
    ...(d.removedStages.length ? [`단계 뺌: ${list(d.removedStages)}`] : []),
    ...d.renamed.map((r) => `이름 바꿈: ${r.from} → ${r.to}`),
    ...d.techs.flatMap((t) => [...(t.added.length ? [`기술 넣음 · ${t.stage}: ${list(t.added)}`] : []), ...(t.removed.length ? [`기술 뺌 · ${t.stage}: ${list(t.removed)}`] : [])]),
    ...(d.addedEdges.length ? [`이음: ${list(d.addedEdges)}`] : []),
    ...(d.removedEdges.length ? [`끊음: ${list(d.removedEdges)}`] : []),
    ...(d.notes.length ? [`메모 바뀜: ${list(d.notes)}`] : []),
  ];
}
