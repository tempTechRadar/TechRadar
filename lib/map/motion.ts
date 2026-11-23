// 레이더 움직임의 시간표(11-21 사용자 결정: 시안 design-concept-3 map.html의 움직임으로). 그리기와 따로 두어 draw.ts가 길어지지 않게.
// 처음 열기: 가운데를 크게 본 채 고리가 안쪽부터 차례로 퍼지고 → 0.3초부터 화면이 1.8초에 걸쳐 물러나며(배율 축소) → 0.5초부터 선(또는 파동)이
// 빠르게 한 바퀴 돌며 지나간 자리에서 기술이 작게 떠올라 제 크기가 된다(가운데서 튀어나오지 않음) → 끝나면 0.8초에 걸쳐 느려지며 옅어져 멈춘다.
// 계속 돌지 않는다(P-12g 사용자 결정: 11-21의 "잔잔하게 계속 돌기"와 ⚙ 분위기 칸을 지움). 그 뒤에는 손댈 때만 다시 그린다.
// 누르거나 휠을 굴리면 처음 연출은 바로 끝난다. 끄기 · 움직임 줄이기면 처음부터 다 보이고 움직임 없음.
// P-12m(11-23 사용자 승인, 시안 Radar.dc.html): "선 + 파동"(both)이 기본. 선은 두 바퀴 돈 뒤 옅어지고, 파동은 1.3초 간격으로 세 번 퍼진다.
// P-12p(11-23 사용자 "너무 요란해"): 처음 연출은 파동 하나 + 옅은 잔물결 하나로 느리게(3.2초), 점은 파동에 닿을 때만 아래에서 떠오르며 흔들리다 멈춘다(riseAt).
//   선은 처음 연출에서 빼고, 뒤에서 아주 옅은 선이 늘 돈다(꾸밈, 점을 켜지 않음, idleAngle · ⚙ radar-prefs).
import type { Item, MapLayout } from "./layout.ts";

/** 움직임 계산에 쓰는 지도 상태(app/tech-map/controller.ts의 MapState가 이 모양을 갖는다). 화면 · DB를 모르는 순수 계산이라 lib에 둔다 */
export type MotionState = {
  still: boolean; motion: "ripple" | "off"; introAt: number; sweepStart: number;
  L: Pick<MapLayout, "radius" | "byId">; W: number; H: number; cam: { x: number; y: number }; scale: () => number;
};
type MapState = MotionState;

const TAU = Math.PI * 2;
export const SWEEP_DELAY = 0.5, REVEAL = 3.2, GROW = 0.45, SLOWDOWN = 1.2;
/** 파동이 시작하는 초: 파동 하나 + 옅은 잔물결 하나(점은 첫 파동에만 켜짐) */
export const WAVES = [0, 1.6] as const;
/** 파동이 다 사라지는 때(시작부터 초): 이때까지는 매 장 그린다 */
export const MOTION_END = WAVES[WAVES.length - 1] + REVEAL + SLOWDOWN;
/** 켜진 점의 ping 고리가 퍼지는 초 · 새 기술 추적 틀이 걸리는 때(켜진 뒤 초)와 틀 수 */
export const PING = 1, LOCK_AFTER = 0.35, LOCK = 0.5, TRACK_MAX = 5;

/** "이번 주" 다시 보기로 날아와 닿은 점의 이름표를 진하게 두는 초(P-12g map-10) */
export const LAND_SEC = 1.5;
/** 처음 화면 배율(집 보기의 몇 배로 가까이 시작하는지)과 물러나는 시간 */
export const INTRO_ZOOM = 2.4, INTRO_FLY = 1.8, INTRO_FLY_DELAY = 0.3;

export const ease = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const moving = (S: MapState) => !S.still && S.motion !== "off";
const since = (S: MapState, now: number) => now - S.sweepStart;
/** 처음 연출이 아직인지(펼침이 다 끝나기 전) */
export const introducing = (S: MapState, now: number) => moving(S) && since(S, now) < REVEAL + GROW;

/** k번째 고리(안쪽부터 1)가 처음 열 때 퍼져 나온 정도 0 → 1. 안쪽부터 0.06초씩 늦게, 0.6초에 걸쳐 */
export function ringGrow(S: MapState, now: number, k: number): number {
  if (!moving(S)) return 1;
  return ease(clamp01((now - S.introAt - Math.min(k, 12) * 0.06) / 0.6));
}

/** 뒤에서 도는 옅은 선의 각도(위에서 시계 방향, 한 바퀴 speed초). 꾸밈이라 점을 켜지 않는다 */
export const idleAngle = (now: number, speed: number) => -Math.PI / 2 + ((now / Math.max(1, speed)) % 1) * TAU;
/** 파동에 닿아 떠오르는 점(P-12p): 닿은 뒤 t초에 아래로 내려가 있는 정도(px, 양수 = 아래). 아래에서 쑥 올라와 살짝 넘쳤다 가라앉으며 흔들리다 멈춘다 */
export function riseAt(t: number): number {
  if (!(t >= 0)) return RISE; // 아직 안 닿음(펼침 grow가 숨김)
  if (t >= RISE_SEC) return 0;
  return RISE * Math.exp(-5 * t) * Math.cos(9 * t);
}
export const RISE = 22, RISE_SEC = 1.4;

/** 파동 반지름(세계 좌표): 펼침 동안 가운데 → 지도 끝(점이 나타나는 거리와 같게), 그 뒤 감속(SLOWDOWN초) 동안 화면 끝까지 옅어지며 한 번으로 끝 */
export function rippleR(S: MapState, now: number, far: number): { r: number; fade: number } {
  const t = since(S, now);
  if (t < REVEAL) return { r: S.L.radius * Math.max(0, t / REVEAL), fade: 1 };
  const p = (t - REVEAL) / SLOWDOWN;
  return p >= 1 ? { r: -1, fade: 0 } : { r: S.L.radius + (far - S.L.radius) * p, fade: 1 - p };
}

/** 첫 파동이 이 점에 닿는 순간(가운데에서 거리 순, P-12p: 선은 점을 켜지 않음). 잔물결 · 배경 선은 다시 켜지 않아 점은 한 번만 켜진다 */
export function litAt(S: Pick<MapState, "sweepStart" | "L">, it: Pick<Item, "x" | "y">): number {
  return S.sweepStart + REVEAL * Math.min(1, Math.hypot(it.x, it.y) / S.L.radius);
}
/** 켜진 지 몇 초(ping 고리 · 위험 · NEW 울림 · 추적 틀용). 움직임이 없으면 -1(끝난 모습) */
export const litAge = (S: MapState, now: number, it: Item) => (moving(S) && Number.isFinite(S.sweepStart) ? now - litAt(S, it) : -1);

/** 이 점이 처음 떠오르는 순간 = 파동이 닿는 순간. 부모 묶음보다 먼저 나오지 않는다(이어지는 선이 빈 곳을 가리키지 않게) */
function revealAt(S: MapState, it: Item): number {
  const own = litAt(S, it);
  const parent = it.parent ? S.L.byId.get(it.parent) : null;
  return parent ? Math.max(own, revealAt(S, parent)) : own;
}
/** 떠오른 지 몇 초(riseAt용): 보이기 시작한 때(revealAt) 기준이라 부모를 기다린 자식도 보이는 동안 떠오른다. 움직임이 없으면 -1 */
export const riseAge = (S: MapState, now: number, it: Item) => (moving(S) && Number.isFinite(S.sweepStart) ? now - revealAt(S, it) : -1);
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

/** 화면 상자 [x, y, 폭, 높이] */
export type Box = [number, number, number, number];
export const overlaps = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
/** 추적 틀 꼬리표를 붙일 점(P-12m 사용자 점검: 꼬리표 · NEW · 이름이 겹침). 같은 점에 다른 꼬리표(등급 · 판단)가 있으면 빼고,
 *  이미 놓인 이름표 · 꼬리표 상자와 겹치면 뺀다(틀은 남김). 앞에 놓인(더 최근) 꼬리표가 뒤 것을 막는다 */
export function placeTags<T>(cands: { item: T; box: Box; busy: boolean }[], taken: Box[]): T[] {
  const out: T[] = [], used = [...taken];
  for (const c of cands) {
    if (c.busy || used.some((b) => overlaps(b, c.box))) continue;
    out.push(c.item); used.push(c.box);
  }
  return out;
}
