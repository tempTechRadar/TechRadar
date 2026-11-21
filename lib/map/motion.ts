// 레이더 움직임의 시간표(11-21 사용자 결정: 시안 design-concept-3 map.html의 움직임으로). 그리기와 따로 두어 draw.ts가 길어지지 않게.
// 처음 열기: 가운데를 크게 본 채 고리가 안쪽부터 차례로 퍼지고 → 0.3초부터 화면이 1.8초에 걸쳐 물러나며(배율 축소) → 0.5초부터 선(또는 파동)이
// 빠르게 한 바퀴 돌며 지나간 자리에서 기술이 작게 떠올라 제 크기가 된다(가운데서 튀어나오지 않음) → 끝나면 0.8초에 걸쳐 천천히 도는 속도로 느려진다.
// 누르거나 휠을 굴리면 처음 연출은 바로 끝난다. 끄기 · 움직임 줄이기면 처음부터 다 보이고 움직임 없음.
import type { Item, MapLayout } from "./layout.ts";

/** 움직임 계산에 쓰는 지도 상태(app/tech-map/controller.ts의 MapState가 이 모양을 갖는다). 화면 · DB를 모르는 순수 계산이라 lib에 둔다 */
export type MotionState = {
  still: boolean; motion: "sweep" | "ripple" | "off"; tune: Tune; shift: number; introAt: number; sweepStart: number;
  L: Pick<MapLayout, "radius" | "byId">; W: number; H: number; cam: { x: number; y: number }; scale: () => number;
};
type MapState = MotionState;

const TAU = Math.PI * 2;
export const SWEEP_DELAY = 0.5, REVEAL = 2, GROW = 0.45, SLOWDOWN = 0.8, GLOW = 0.7;
/** 분위기(오른쪽 아래 ⚙): 펼친 뒤 도는 한 바퀴 초 · 파동 간격 초 · 파동이 화면 끝까지 번지는 초 · 선 뒤 잔광(여운) 각도(라디안).
 *  펼침(처음 연출)과 점 빛남(GLOW초)은 분위기와 상관없이 같다. 기본은 잔잔하게(11-21 사용자 "전부 추천대로", 파동을 잔잔하게) */
export type Tune = "calm" | "base" | "vivid";
export const TUNES: Tune[] = ["calm", "base", "vivid"];
export const DEFAULT_TUNE: Tune = "calm";
export const TUNE: Record<Tune, { ambient: number; ripple: number; rippleGrow: number; trail: number }> = {
  calm: { ambient: 22, ripple: 10, rippleGrow: 3.4, trail: 1.5 },
  base: { ambient: 16, ripple: 6, rippleGrow: 2.4, trail: 1.2 },
  vivid: { ambient: 10, ripple: 4, rippleGrow: 1.8, trail: 0.9 },
};
/** 처음 화면 배율(집 보기의 몇 배로 가까이 시작하는지)과 물러나는 시간 */
export const INTRO_ZOOM = 2.4, INTRO_FLY = 1.8, INTRO_FLY_DELAY = 0.3;
const W_FAST = TAU / REVEAL, wSlow = (S: MapState) => TAU / TUNE[S.tune].ambient;

export const ease = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const angleOf = (x: number, y: number) => (Math.atan2(y, x) + Math.PI / 2 + TAU) % TAU;
export const moving = (S: MapState) => !S.still && S.motion !== "off";
const since = (S: MapState, now: number) => now - S.sweepStart;
/** 처음 연출이 아직인지(펼침이 다 끝나기 전) */
export const introducing = (S: MapState, now: number) => moving(S) && since(S, now) < REVEAL + GROW;

/** k번째 고리(안쪽부터 1)가 처음 열 때 퍼져 나온 정도 0 → 1. 안쪽부터 0.06초씩 늦게, 0.6초에 걸쳐 */
export function ringGrow(S: MapState, now: number, k: number): number {
  if (!moving(S)) return 1;
  return ease(clamp01((now - S.introAt - Math.min(k, 12) * 0.06) / 0.6));
}

/** 펼친 뒤 지난 시간 τ에서 돈 각도: 빠른 속도에서 SLOWDOWN초 동안 (1-u)² 곡선으로 느려진 뒤 천천히 w로(시안의 boost) */
const afterAngle = (tau: number, w: number) => { const m = Math.min(tau, SLOWDOWN); return w * tau + (W_FAST - w) * (SLOWDOWN / 3) * (1 - (1 - m / SLOWDOWN) ** 3); };
/** 선의 각도(위에서 시계 방향) */
export function sweepAngle(S: MapState, now: number): number {
  const t = since(S, now);
  return -Math.PI / 2 + (t < REVEAL ? Math.max(0, t) * W_FAST : TAU + afterAngle(t - REVEAL + S.shift, wSlow(S)));
}
/** 분위기를 바꿀 때 새 shift(펼친 뒤 시계에 더하는 초): 선은 지금 각도에서, 파동은 지금 번지던 정도(틈이면 틈의 비율)에서 새 속도로 이어 간다.
 *  sweepStart는 그대로 둔다(위험 맥박 10초 · 펼침이 그 시계를 쓴다). 펼침 · 감속 중이거나 끄기면 그대로 */
export function retune(S: MapState, now: number, tune: Tune): number {
  const tau = since(S, now) - REVEAL, cur = tau + S.shift;
  if (!(tau > SLOWDOWN) || !Number.isFinite(tau)) return S.shift;
  if (S.motion === "ripple") {
    const o = TUNE[S.tune], n = TUNE[tune], c = cur % o.ripple;
    const cn = c < o.rippleGrow ? (c / o.rippleGrow) * n.rippleGrow : n.rippleGrow + ((c - o.rippleGrow) / (o.ripple - o.rippleGrow)) * (n.ripple - n.rippleGrow);
    return Math.floor(cur / n.ripple) * n.ripple + cn - tau;
  }
  if (S.motion !== "sweep") return S.shift;
  const w = TAU / TUNE[tune].ambient, turn = TAU / w, lead = (W_FAST - w) * (SLOWDOWN / 3); // 감속이 끝난 뒤 각도 = w·τ + lead
  let tauNew = (afterAngle(cur, wSlow(S)) - lead) / w;
  tauNew += Math.round((cur - tauNew) / turn) * turn; // 같은 각도 중 지금 시계와 가장 가까운 것
  if (tauNew < SLOWDOWN) tauNew += turn;
  return tauNew - tau;
}
/** 지금 선의 각속도(빛남 계산용) */
const sweepSpeed = (S: MapState, now: number) => { const t = since(S, now) - REVEAL, w = wSlow(S); return t < 0 ? W_FAST : w + (W_FAST - w) * (1 - Math.min(t + S.shift, SLOWDOWN) / SLOWDOWN) ** 2; };
/** 선 · 파동의 진하기: 시작 전 0, 펼침 동안 1, 그 뒤 옅게(배경으로) */
export function sweepAlpha(S: MapState, now: number): number {
  const t = since(S, now);
  if (!moving(S) || !(t >= 0)) return 0;
  return t < REVEAL ? 1 : 0.45 + 0.55 * (1 - Math.min(1, (t - REVEAL) / SLOWDOWN));
}

/** 파동 반지름(세계 좌표): 펼침 동안 가운데 → 지도 끝(점이 나타나는 거리와 같게), 그 뒤 분위기의 ripple초마다 rippleGrow초에 걸쳐 화면 끝까지 */
export function rippleR(S: MapState, now: number, far: number): { r: number; fade: number } {
  const t = since(S, now);
  if (t < REVEAL) return { r: S.L.radius * Math.max(0, t / REVEAL), fade: 1 };
  const { ripple, rippleGrow } = TUNE[S.tune], p = ((t - REVEAL + S.shift) % ripple) / rippleGrow;
  return p >= 1 ? { r: -1, fade: 0 } : { r: far * p, fade: 1 - p };
}

/** 이 점이 처음 떠오르는 순간: 선이면 각도 순, 파동이면 가운데에서 거리 순. 부모 묶음보다 먼저 나오지 않는다(이어지는 선이 빈 곳을 가리키지 않게) */
function revealAt(S: MapState, it: Item): number {
  const own = S.sweepStart + REVEAL * (S.motion === "ripple" ? Math.min(1, Math.hypot(it.x, it.y) / S.L.radius) : angleOf(it.x, it.y) / TAU);
  const parent = it.parent ? S.L.byId.get(it.parent) : null;
  return parent ? Math.max(own, revealAt(S, parent)) : own;
}
/** 펼침 진행 0 → 1(부드럽게 감속), 움직임이 없거나 펼침이 끝났으면 늘 1(점마다 계산하지 않음) */
export function grow(S: MapState, now: number, it: Item): number {
  if (!introducing(S, now)) return 1;
  const p = (now - revealAt(S, it)) / GROW;
  return p <= 0 ? 0 : p >= 1 ? 1 : ease(p);
}

/** 지도 가운데에서 화면 끝까지의 거리(세계 좌표): 선 · 파동은 지도 끝이 아니라 화면 끝까지 */
export function farWorld(S: MapState): number {
  const sc = S.scale(), ox = S.W / 2 - S.cam.x * sc, oy = S.H / 2 - S.cam.y * sc;
  return (Math.max(Math.hypot(ox, oy), Math.hypot(S.W - ox, oy), Math.hypot(ox, S.H - oy), Math.hypot(S.W - ox, S.H - oy)) + 40) / sc;
}

/** 선 · 파동이 이 점을 지나간 지 몇 초(빛남용). 아직 안 지났으면 큰 값 */
export function touchAge(S: MapState, now: number, it: Item): number {
  if (S.motion === "ripple") {
    const far = farWorld(S), t = since(S, now), { r } = rippleR(S, now, far), d = r - Math.hypot(it.x, it.y);
    const speed = t < REVEAL ? S.L.radius / REVEAL : far / TUNE[S.tune].rippleGrow;
    return r >= 0 && d >= 0 ? d / speed : 99;
  }
  return ((((sweepAngle(S, now) - (angleOf(it.x, it.y) - Math.PI / 2)) % TAU) + TAU) % TAU) / sweepSpeed(S, now);
}
