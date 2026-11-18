// flow.json의 상자를 왼쪽→오른쪽 단계로 배치한다. 화살표는 항상 오른쪽으로 간다(순환이 있으면 오류).
import type { Flow, FlowEdge, FlowNode } from "./types.ts";

// gapX는 화살표 위 건수 꼬리표(최대 약 90px)가 상자 사이에 들어갈 만큼(lib/flow/edge-label). 52에서는 꼬리표가 상자와 겹쳤다.
export const BOX = { w: 172, h: 64, gapX: 100, gapY: 30, pad: 20 };

export type PlacedNode = FlowNode & { x: number; y: number; col: number };
/** 3차 베지어의 네 점(시작·조절점 둘·끝). 건수 꼬리표 자리를 곡선 위에서 찾을 때 쓴다 */
export type Curve = { sx: number; sy: number; c1x: number; c1y: number; c2x: number; c2y: number; tx: number; ty: number };
/** mx·my: 곡선의 가운데 */
export type PlacedEdge = FlowEdge & { d: string; mx: number; my: number; curve: Curve };
export type Layout = { nodes: PlacedNode[]; edges: PlacedEdge[]; width: number; height: number };

/** 상자마다 "시작에서 가장 먼 길의 길이"를 단계(열)로 쓴다. */
function columns(flow: Flow): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const n of flow.nodes) incoming.set(n.id, []);
  for (const e of flow.edges) {
    if (!incoming.has(e.from) || !incoming.has(e.to)) throw new Error(`화살표가 없는 상자를 가리킴: ${e.from} → ${e.to}`);
    incoming.get(e.to)!.push(e.from);
  }
  const col = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (id: string): number => {
    const known = col.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error(`흐름에 순환이 있음: ${id}`);
    visiting.add(id);
    const d = Math.max(-1, ...incoming.get(id)!.map(depth)) + 1;
    visiting.delete(id);
    col.set(id, d);
    return d;
  };
  flow.nodes.forEach((n) => depth(n.id));
  return col;
}

/** 같은 열 안에서는 앞 열 상자들의 평균 높이에 가깝게 놓아 화살표가 덜 꼬이게 한다. */
function rows(flow: Flow, col: Map<string, number>): Map<string, number> {
  const maxCol = Math.max(...col.values());
  const row = new Map<string, number>();
  const order = (c: number) => flow.nodes.filter((n) => col.get(n.id) === c);
  order(0).forEach((n, i) => row.set(n.id, i));
  for (let c = 1; c <= maxCol; c++) {
    const avg = (id: string) => {
      const prev = flow.edges.filter((e) => e.to === id).map((e) => row.get(e.from) ?? 0);
      return prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
    };
    order(c)
      .map((n, i) => ({ id: n.id, key: avg(n.id), i }))
      .sort((a, b) => a.key - b.key || a.i - b.i)
      .forEach((n, r) => row.set(n.id, r));
  }
  return row;
}

export function layoutFlow(flow: Flow): Layout {
  const col = columns(flow);
  const row = rows(flow, col);
  const nodes: PlacedNode[] = flow.nodes.map((n) => ({
    ...n,
    col: col.get(n.id)!,
    x: BOX.pad + col.get(n.id)! * (BOX.w + BOX.gapX),
    y: BOX.pad + row.get(n.id)! * (BOX.h + BOX.gapY),
  }));
  const at = new Map(nodes.map((n) => [n.id, n]));
  const edges: PlacedEdge[] = flow.edges.map((e) => {
    const a = at.get(e.from)!;
    const b = at.get(e.to)!;
    const sx = a.x + BOX.w, sy = a.y + BOX.h / 2, tx = b.x, ty = b.y + BOX.h / 2;
    const dx = Math.max(24, (tx - sx) / 2);
    // 3차 베지어의 t=0.5 지점: (P0 + 3P1 + 3P2 + P3) / 8
    const mx = (sx + 3 * (sx + dx) + 3 * (tx - dx) + tx) / 8, my = (sy + 3 * sy + 3 * ty + ty) / 8;
    const curve: Curve = { sx, sy, c1x: sx + dx, c1y: sy, c2x: tx - dx, c2y: ty, tx, ty };
    return { ...e, d: `M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}`, mx, my, curve };
  });
  return {
    nodes,
    edges,
    width: BOX.pad * 2 + (Math.max(...col.values()) + 1) * (BOX.w + BOX.gapX) - BOX.gapX,
    height: BOX.pad * 2 + (Math.max(...row.values()) + 1) * (BOX.h + BOX.gapY) - BOX.gapY,
  };
}

/** 한 상자에서 출발해 닿을 수 있는 화살표들("from>to"). 누른 시작의 길을 굵게 보이는 데 쓴다. */
export function reachableEdges(flow: Flow, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const edges = new Set<string>();
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of flow.edges) {
      if (e.from !== id) continue;
      edges.add(`${e.from}>${e.to}`);
      if (!seen.has(e.to)) (seen.add(e.to), queue.push(e.to));
    }
  }
  return edges;
}
