// 프로젝트 관리 보드 배치(P-12i D1 · P-12k K1): 걸린 판 = 칸 {x, y, w, h}(한 줄 24px, 한 칸 폭 = 판 폭 ÷ COLS). 화면 · 저장소를 모르는 순수 함수.
// 배치는 이 브라우저(localStorage)에만 둔다(DB 0). 깨진 값이면 기본 배치, 새로 생긴 위젯은 기본 자리로 더한다. hidden = 사용자가 뺀 위젯.
export const CELL = 24, COLS = 48;
export const MIN_W = 8, MIN_H = 4, MAX_X = 200;
export type Box = { id: string; x: number; y: number; w: number; h: number; hidden?: boolean };

/** 기본 배치(P-12k K1 컴팩트 타공보드): 1440×900 첫 화면에 판 4개가 다 들어오게(27줄 ≈ 650px). 왼쪽 진행 중 프로젝트 · 아래 직접 추가, 오른쪽 지도 · 소식 · 아래 청사진 */
const DEFAULTS: Record<string, Omit<Box, "id">> = {
  repos: { x: 0, y: 0, w: 30, h: 20 },
  radar: { x: 31, y: 0, w: 17, h: 17 },
  blueprint: { x: 31, y: 18, w: 17, h: 9 },
  add: { x: 0, y: 21, w: 30, h: 6 },
};
export function defaultLayout(ids: string[]): Box[] {
  let bottom = 0;
  return ids.map((id) => {
    const d = DEFAULTS[id] ?? { x: 0, y: bottom + 1, w: 24, h: 12 }; // 기본 자리가 없는 위젯은 맨 아래
    bottom = Math.max(bottom, d.y + d.h);
    return { id, ...d };
  });
}

/** 칸에 맞추고(정수) 너무 작거나 밖으로 나가지 않게 */
export function snapBox(b: Box): Box {
  const n = (v: number, lo: number, hi = Infinity) => Math.min(hi, Math.max(lo, Math.round(Number.isFinite(v) ? v : lo)));
  return { ...b, x: n(b.x, 0, MAX_X), y: n(b.y, 0), w: n(b.w, MIN_W, MAX_X), h: n(b.h, MIN_H) };
}

const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 옮기거나 키운 위젯(moved)과 겹치는 위젯을 그 아래로 밀어낸다. 밀린 위젯이 또 겹치면 이어서(위에서부터 한 번씩) */
export function pushDown(boxes: Box[], moved: string): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  const fixed = [out.find((b) => b.id === moved)].filter((b): b is Box => Boolean(b && !b.hidden));
  for (const b of out.filter((x) => x.id !== moved && !x.hidden).sort((p, q) => p.y - q.y || p.x - q.x)) {
    for (let i = 0; i < out.length && fixed.some((f) => hit(f, b)); i++) b.y = Math.max(...fixed.filter((f) => hit(f, b)).map((f) => f.y + f.h));
    fixed.push(b);
  }
  return out;
}

/** 저장된 글 → 배치: 아는 위젯만, 칸 맞추기, 빠진 위젯은 기본 자리로. 글이 깨졌거나 모양이 다르면 기본 배치 */
export function parseLayout(raw: string | null, ids: string[]): Box[] {
  let v: unknown;
  try { v = JSON.parse(raw ?? "null"); } catch { return defaultLayout(ids); }
  if (!Array.isArray(v)) return defaultLayout(ids);
  const ok = v.filter((b): b is Box => b && typeof b === "object" && ids.includes(b.id) && ["x", "y", "w", "h"].every((k) => typeof b[k] === "number"));
  if (!ok.length) return defaultLayout(ids);
  const got = new Map(ok.map((b) => [b.id, snapBox({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, ...(b.hidden ? { hidden: true } : {}) })]));
  const base = defaultLayout(ids), bottom = Math.max(0, ...[...got.values()].map((b) => b.y + b.h));
  return ids.map((id) => got.get(id) ?? { ...base.find((b) => b.id === id)!, y: bottom + 1 });
}

/** 좁은 화면(≤860)에서 한 줄로 쌓는 차례: 위에서 아래, 같은 줄이면 왼쪽부터. 뺀 위젯은 없음 */
/** 주소 #w-<id>로 온 판이 빠져 있으면 다시 걸고 겹치는 판을 밀어낸다(링크가 판을 빼도 깨지지 않게). 이미 걸렸거나 모르는 판이면 그대로 */
export function reveal(boxes: Box[], id: string): Box[] {
  if (!boxes.some((b) => b.id === id && b.hidden)) return boxes;
  return pushDown(boxes.map((b) => (b.id === id ? { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h } : b)), id);
}

export const stackOrder = (boxes: Box[]): string[] => boxes.filter((b) => !b.hidden).sort((a, b) => a.y - b.y || a.x - b.x).map((b) => b.id);

/** 캔버스 높이(px): 가장 아래 위젯 + 두 칸 */
export const boardHeight = (boxes: Box[]): number => (Math.max(0, ...boxes.filter((b) => !b.hidden).map((b) => b.y + b.h)) + 2) * CELL;
