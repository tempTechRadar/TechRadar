// 화살표 위 건수 꼬리표의 자리(docs/flow.md 3절). 순수 함수: 꼬리표가 어떤 상자와도 겹치지 않는 곡선 위 지점을 고른다.
// 숫자 자체는 lib/flow/counts가 실제 기록으로만 정한다(불변 6). 여기서는 어디에 쓸지만 정한다.
import { BOX, type Layout, type PlacedEdge } from "./layout.ts";

export const LABEL_H = 18;
const MARGIN = 3; // 상자 테두리(최대 4px)와 꼬리표 사이 여유

/** 꼬리표 폭: 한글·기호는 넓고 영문·숫자는 좁다(글자 크기 11 기준). 상자 꼬리표(badge)도 같은 규칙. */
export const labelWidth = (s: string): number => [...s].reduce((w, c) => w + (c.charCodeAt(0) < 128 ? 6.8 : 11), 14);

export type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

/** 곡선 위 t(0~1) 지점 */
export function pointAt(e: PlacedEdge, t: number): { x: number; y: number } {
  const { sx, sy, c1x, c1y, c2x, c2y, tx, ty } = e.curve;
  const u = 1 - t;
  return {
    x: u * u * u * sx + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * tx,
    y: u * u * u * sy + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ty,
  };
}

// 가운데부터 바깥으로: 되도록 곡선 가운데에 두고, 막히면 조금씩 옮긴다
const TRIES = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];

/** 꼬리표 사각형. 곡선 위에서 상자와 겹치지 않는 첫 자리, 없으면 출발 상자 바로 오른쪽 간격 한가운데(상자 없는 띠). */
export function placeLabel(e: PlacedEdge, text: string, layout: Pick<Layout, "nodes" | "width" | "height">): Rect {
  const w = labelWidth(text);
  const boxes: Rect[] = layout.nodes.map((n) => ({ x: n.x - MARGIN, y: n.y - MARGIN, w: BOX.w + 2 * MARGIN, h: BOX.h + 2 * MARGIN }));
  const at = (x: number, y: number): Rect => ({ x: x - w / 2, y: y - LABEL_H / 2, w, h: LABEL_H });
  const inside = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= layout.width && r.y + r.h <= layout.height;
  for (const t of TRIES) {
    const p = pointAt(e, t);
    const r = at(p.x, p.y);
    if (inside(r) && !boxes.some((b) => overlaps(r, b))) return r;
  }
  return at(e.curve.sx + BOX.gapX / 2, e.curve.sy);
}

/** 시험용: 사각형이 상자와 겹치는가 */
export function hitsBox(r: Rect, layout: Pick<Layout, "nodes">): string[] {
  return layout.nodes.filter((n) => overlaps(r, { x: n.x, y: n.y, w: BOX.w, h: BOX.h })).map((n) => n.id);
}
