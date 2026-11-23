// 레이더 움직임의 시간표(11-21 사용자 결정: 시안 design-concept-3 map.html의 움직임으로). 그리기와 따로 두어 draw.ts가 길어지지 않게.
// 처음 열기: 가운데를 크게 본 채 고리가 안쪽부터 차례로 퍼지고 → 0.3초부터 화면이 1.8초에 걸쳐 물러나며(배율 축소) → 0.5초부터 선(또는 파동)이
// 빠르게 한 바퀴 돌며 지나간 자리에서 기술이 작게 떠올라 제 크기가 된다(가운데서 튀어나오지 않음) → 끝나면 0.8초에 걸쳐 느려지며 옅어져 멈춘다.
// 계속 돌지 않는다(P-12g 사용자 결정: 11-21의 "잔잔하게 계속 돌기"와 ⚙ 분위기 칸을 지움). 그 뒤에는 손댈 때만 다시 그린다.
// 누르거나 휠을 굴리면 처음 연출은 바로 끝난다. 끄기 · 움직임 줄이기면 처음부터 다 보이고 움직임 없음.
// P-12m(11-23 사용자 승인, 시안 Radar.dc.html): "선 + 파동"(both)이 기본. 선은 두 바퀴 돈 뒤 옅어지고, 파동은 1.3초 간격으로 세 번 퍼진다.
import type { Item, MapLayout } from "./layout.ts";

/** 움직임 계산에 쓰는 지도 상태(app/tech-map/controller.ts의 MapState가 이 모양을 갖는다). 화면 · DB를 모르는 순수 계산이라 lib에 둔다 */
export type MotionState = {
  still: boolean; motion: "sweep" | "ripple" | "both" | "off"; introAt: number; sweepStart: number;
  L: Pick<MapLayout, "radius" | "byId">; W: number; H: number; cam: { x: number; y: number }; scale: () => number;
};
type MapState = MotionState;

const TAU = Math.PI * 2;
export const SWEEP_DELAY = 0.5, REVEAL = 2, GROW = 0.45, SLOWDOWN = 0.8;
/** 선이 도는 바퀴 수(첫 바퀴에 점이 떠오르고 둘째 바퀴는 지나가기만)와 파동이 시작하는 초(세 번) */
export const TURNS = 2, WAVES = [0, 1.3, 2.6] as const;
/** 선 · 파동이 다 사라지는 때(선 시작부터 초): 이때까지는 매 장 그린다 */
export const MOTION_END = Math.max(REVEAL * TURNS, WAVES[WAVES.length - 1] + REVEAL) + SLOWDOWN;
/** 켜진 점의 ping 고리가 퍼지는 초 · 새 기술 추적 틀이 걸리는 때(켜진 뒤 초)와 틀 수 */
export const PING = 1, LOCK_AFTER = 0.35, LOCK = 0.5, TRACK_MAX = 5;

/** "이번 주" 다시 보기로 날아와 닿은 점의 이름표를 진하게 두는 초(P-12g map-10) */
export const LAND_SEC = 1.5;
/** 처음 화면 배율(집 보기의 몇 배로 가까이 시작하는지)과 물러나는 시간 */
export const INTRO_ZOOM = 2.4, INTRO_FLY = 1.8, INTRO_FLY_DELAY = 0.3;
const W_FAST = TAU / REVEAL, W_SLOW = TAU / 22; // 감속이 닿는 속도(한 바퀴 22초, 11-21의 "잔잔하게")

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
/** 선의 각도(위에서 시계 방향): TURNS 바퀴를 빠르게 돈 뒤 느려진다 */
export function sweepAngle(S: MapState, now: number): number {
  const t = since(S, now), spin = REVEAL * TURNS;
  return -Math.PI / 2 + (t < spin ? Math.max(0, t) * W_FAST : TURNS * TAU + afterAngle(t - spin, W_SLOW));
}
/** 선의 진하기: 시작 전 0, TURNS 바퀴 동안 1, 감속(SLOWDOWN초) 동안 옅어져 0(멈춤). 파동만이면 늘 0 */
export function sweepAlpha(S: MapState, now: number): number {
  const t = since(S, now), spin = REVEAL * TURNS;
  if (!moving(S) || S.motion === "ripple" || !(t >= 0)) return 0;
  return t < spin ? 1 : 1 - Math.min(1, (t - spin) / SLOWDOWN);
}

/** 파동 반지름(세계 좌표): 펼침 동안 가운데 → 지도 끝(점이 나타나는 거리와 같게), 그 뒤 감속(SLOWDOWN초) 동안 화면 끝까지 옅어지며 한 번으로 끝 */
export function rippleR(S: MapState, now: number, far: number): { r: number; fade: number } {
  const t = since(S, now);
  if (t < REVEAL) return { r: S.L.radius * Math.max(0, t / REVEAL), fade: 1 };
  const p = (t - REVEAL) / SLOWDOWN;
  return p >= 1 ? { r: -1, fade: 0 } : { r: S.L.radius + (far - S.L.radius) * p, fade: 1 - p };
}

/** 선(첫 바퀴) · 첫 파동이 이 점에 닿는 순간. 둘 다면 먼저 닿는 쪽 하나뿐이라 점은 한 번만 켜진다(둘째 바퀴 · 뒤 파동은 다시 켜지 않음) */
export function litAt(S: Pick<MapState, "motion" | "sweepStart" | "L">, it: Pick<Item, "x" | "y">): number {
  const bySweep = S.sweepStart + REVEAL * (angleOf(it.x, it.y) / TAU), byRipple = S.sweepStart + REVEAL * Math.min(1, Math.hypot(it.x, it.y) / S.L.radius);
  return S.motion === "ripple" ? byRipple : S.motion === "both" ? Math.min(bySweep, byRipple) : bySweep;
}
/** 켜진 지 몇 초(ping 고리 · 위험 · NEW 울림 · 추적 틀용). 움직임이 없으면 -1(끝난 모습) */
export const litAge = (S: MapState, now: number, it: Item) => (moving(S) && Number.isFinite(S.sweepStart) ? now - litAt(S, it) : -1);

/** 이 점이 처음 떠오르는 순간 = 선 · 파동이 닿는 순간. 부모 묶음보다 먼저 나오지 않는다(이어지는 선이 빈 곳을 가리키지 않게) */
function revealAt(S: MapState, it: Item): number {
  const own = litAt(S, it);
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

/** 새 기술 추적 틀을 걸 점: 지도 NEW 규칙(build-map: 들어온 지 7일 안, capNew로 줄인 것)인 기술 중 최근에 들어온 max개. 실제 기록(addedAt)만 본다(불변 6) */
export function trackTargets<T extends { node: { isNew: boolean; addedAt: string | null } }>(items: T[], max = TRACK_MAX): T[] {
  return items.filter((it) => it.node.isNew && it.node.addedAt).sort((a, b) => Date.parse(b.node.addedAt!) - Date.parse(a.node.addedAt!)).slice(0, max);
}
