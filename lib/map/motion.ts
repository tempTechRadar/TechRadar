// 레이더 움직임의 시간표(11-21 사용자 결정: 시안 design-concept-3 map.html의 움직임으로). 그리기와 따로 두어 draw.ts가 길어지지 않게.
// 처음 열기: 가운데를 크게 본 채 고리가 안쪽부터 차례로 퍼지고 → 0.3초부터 화면이 1.8초에 걸쳐 물러나며(배율 축소) → 0.5초부터 선(또는 파동)이
// 빠르게 한 바퀴 돌며 지나간 자리에서 기술이 작게 떠올라 제 크기가 된다(가운데서 튀어나오지 않음) → 끝나면 0.8초에 걸쳐 느려지며 옅어져 멈춘다.
// 계속 돌지 않는다(P-12g 사용자 결정: 11-21의 "잔잔하게 계속 돌기"와 ⚙ 분위기 칸을 지움). 그 뒤에는 손댈 때만 다시 그린다.
// 누르거나 휠을 굴리면 처음 연출은 바로 끝난다. 끄기 · 움직임 줄이기면 처음부터 다 보이고 움직임 없음.
import type { Item, MapLayout } from "./layout.ts";

/** 움직임 계산에 쓰는 지도 상태(app/tech-map/controller.ts의 MapState가 이 모양을 갖는다). 화면 · DB를 모르는 순수 계산이라 lib에 둔다 */
export type MotionState = {
  still: boolean; motion: "sweep" | "ripple" | "off"; introAt: number; sweepStart: number;
  L: Pick<MapLayout, "radius" | "byId">; W: number; H: number; cam: { x: number; y: number }; scale: () => number;
};
type MapState = MotionState;

const TAU = Math.PI * 2;
export const SWEEP_DELAY = 0.5, REVEAL = 2, GROW = 0.45, SLOWDOWN = 0.8, GLOW = 0.7;
/** 펼친 뒤 감속이 닿는 속도(한 바퀴 초) · 파동 간격 초 · 파동이 화면 끝까지 번지는 초 · 선 뒤 잔광(여운) 각도(라디안). 11-21의 "잔잔하게" 값 */
export const TUNE = { ambient: 22, ripple: 10, rippleGrow: 3.4, trail: 1.5 };
/** 처음 화면 배율(집 보기의 몇 배로 가까이 시작하는지)과 물러나는 시간 */
export const INTRO_ZOOM = 2.4, INTRO_FLY = 1.8, INTRO_FLY_DELAY = 0.3;
const W_FAST = TAU / REVEAL, W_SLOW = TAU / TUNE.ambient;

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
  return -Math.PI / 2 + (t < REVEAL ? Math.max(0, t) * W_FAST : TAU + afterAngle(t - REVEAL, W_SLOW));
}
/** 지금 선의 각속도(빛남 계산용) */
const sweepSpeed = (S: MapState, now: number) => { const t = since(S, now) - REVEAL; return t < 0 ? W_FAST : W_SLOW + (W_FAST - W_SLOW) * (1 - Math.min(t, SLOWDOWN) / SLOWDOWN) ** 2; };
/** 선 · 파동의 진하기: 시작 전 0, 펼침 동안 1, 감속(SLOWDOWN초) 동안 옅어져 0(멈춤) */
export function sweepAlpha(S: MapState, now: number): number {
  const t = since(S, now);
  if (!moving(S) || !(t >= 0)) return 0;
  return t < REVEAL ? 1 : 1 - Math.min(1, (t - REVEAL) / SLOWDOWN);
}

/** 파동 반지름(세계 좌표): 펼침 동안 가운데 → 지도 끝(점이 나타나는 거리와 같게), 그 뒤 rippleGrow초에 걸쳐 화면 끝까지(감속 동안 옅어져 사라짐) */
export function rippleR(S: MapState, now: number, far: number): { r: number; fade: number } {
  const t = since(S, now);
  if (t < REVEAL) return { r: S.L.radius * Math.max(0, t / REVEAL), fade: 1 };
  const { ripple, rippleGrow } = TUNE, p = ((t - REVEAL) % ripple) / rippleGrow;
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

/** "최근 확인" 기준(팀 추정, spec 11절): 정기 확인이 하루 한 번(06:00)이라 하루 반 */
export const RECENT_HOURS = 36;
/** 선이 지날 때 밝아지는 점 = 수집 오류 없이 RECENT_HOURS 안에 실제로 확인한 기술(ADR 0032 3항, P-12g map-2). 확인한 적 없음 · 오래됨 · 오류는 빛나지 않는다 */
export function recentlyChecked(n: { lastCheckedOkAt: string | null; collectErrorKind: string | null }, nowMs: number): boolean {
  if (n.collectErrorKind || !n.lastCheckedOkAt) return false;
  return nowMs - Date.parse(n.lastCheckedOkAt) <= RECENT_HOURS * 3_600_000; // 읽을 수 없는 시각(NaN)은 거짓
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
    const speed = t < REVEAL ? S.L.radius / REVEAL : far / TUNE.rippleGrow;
    return r >= 0 && d >= 0 ? d / speed : 99;
  }
  return ((((sweepAngle(S, now) - (angleOf(it.x, it.y) - Math.PI / 2)) % TAU) + TAU) % TAU) / sweepSpeed(S, now);
}
