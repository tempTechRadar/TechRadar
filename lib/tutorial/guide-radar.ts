// Tutorial(/guide) 맨 위 레이더 그림(I-tutorial-motion): 제품 지도의 축소판을 흉내 낸 꾸밈. 실제 기술 · 실제 확인 기록이 아니라서 화면에 "그림"이라고 적는다.
// 여기는 순수 계산만(점 자리 · 선 각도 · 밝기): 캔버스 그리기는 app/guide/radar-hero.tsx.
// 뜻은 제품 지도와 같다: 도는 선이 지나간 점이 밝아졌다 서서히 식고, 점 색은 등급 토큰이다.
import { ALERT_KINDS } from "./guide-steps.ts";
import { GRADES } from "./guide-sections.ts";

const TAU = Math.PI * 2;
/** 선이 한 바퀴 도는 시간(ms). 멀미 기준: 12초 이상 */
export const SWEEP_MS = 16_000;
/** 선이 지나간 점이 식는 시간(ms) */
export const COOL_MS = 4_200;
/** 위험 점의 고리 파문이 퍼지는 시간(ms) */
export const RING_MS = 1_400;
/** 위험 점을 지난 뒤 한 줄 캡션을 띄워 두는 시간(ms) */
export const CAPTION_MS = 4_500;

/** 등급 토큰(GRADES와 같은 순서 · 같은 색): 위험 · 주의 · 통과 · 찾지 못함 */
export type RadarGrade = 0 | 1 | 2 | 3;
export const RADAR_TOKENS: string[] = GRADES.map((g) => g.token);
/** 점: 각도(0~1, 위에서 시계 방향) · 가운데부터 거리(0~1) · 등급 · 크기 */
export type RadarDot = { turn: number; r: number; grade: RadarGrade; size: number };
/** 고정된 점 자리(난수 없음: 서버 그림 · 정지 그림 · 시험이 같은 모양). 위험은 둘뿐(대부분은 통과) */
export const RADAR_DOTS: RadarDot[] = [
  { turn: 0.04, r: 0.52, grade: 2, size: 3.5 }, { turn: 0.11, r: 0.84, grade: 2, size: 3 }, { turn: 0.17, r: 0.33, grade: 1, size: 4 },
  { turn: 0.24, r: 0.68, grade: 0, size: 4.5 }, { turn: 0.31, r: 0.9, grade: 3, size: 3 }, { turn: 0.36, r: 0.45, grade: 2, size: 3.5 },
  { turn: 0.44, r: 0.74, grade: 2, size: 4 }, { turn: 0.5, r: 0.28, grade: 3, size: 3 }, { turn: 0.57, r: 0.6, grade: 1, size: 3.5 },
  { turn: 0.63, r: 0.87, grade: 2, size: 3 }, { turn: 0.7, r: 0.4, grade: 2, size: 4 }, { turn: 0.76, r: 0.72, grade: 0, size: 4.5 },
  { turn: 0.83, r: 0.55, grade: 2, size: 3.5 }, { turn: 0.9, r: 0.8, grade: 1, size: 3 }, { turn: 0.96, r: 0.3, grade: 2, size: 3.5 },
];
/** 움직임 줄이기 · 멈춤일 때 보이는 정지 한 장의 시각(ms): 선이 첫 위험 점을 막 지난 자리 */
export const STILL_MS = SWEEP_MS * 0.3;

/** 위험 점을 지날 때 옆에 뜨는 한 줄: 알림 "보안 경고"와 그 조건의 첫 문장(검토를 거친 문구 그대로) */
export const RADAR_CAPTION = { tag: ALERT_KINDS[0].name, text: `${ALERT_KINDS[0].when.split(". ")[0]}.` };

/** 선의 자리(0~1 바퀴) */
export const sweepTurn = (ms: number): number => ((ms % SWEEP_MS) + SWEEP_MS) % SWEEP_MS / SWEEP_MS;
/** 선이 이 점을 마지막으로 지난 뒤 흐른 시간(ms). 아직 한 번도 안 지났으면(첫 바퀴) Infinity */
export function sincePass(dot: Pick<RadarDot, "turn">, ms: number): number {
  const at = dot.turn * SWEEP_MS, lap = Math.floor((ms - at) / SWEEP_MS);
  return lap < 0 ? Infinity : ms - at - lap * SWEEP_MS;
}
/** 점 밝기 0.28(식은 상태) → 1(막 지남): 지난 뒤 COOL_MS에 걸쳐 서서히 식는다 */
export function glow(dot: Pick<RadarDot, "turn">, ms: number): number {
  const p = Math.min(1, sincePass(dot, ms) / COOL_MS);
  return 0.28 + 0.72 * (1 - p) ** 2;
}
/** 위험 점의 고리 파문 진행 0 → 1. 파문이 없을 때는 -1 */
export function ring(dot: RadarDot, ms: number): number {
  const age = sincePass(dot, ms);
  return dot.grade === 0 && age < RING_MS ? age / RING_MS : -1;
}
/** 캡션을 띄울 때인지: 어느 위험 점이든 지난 지 CAPTION_MS 안 */
export const captionOn = (ms: number): boolean => RADAR_DOTS.some((d) => d.grade === 0 && sincePass(d, ms) < CAPTION_MS);
/** 점의 화면 자리(가운데 cx · cy, 반지름 R) */
export function dotXY(dot: Pick<RadarDot, "turn" | "r">, cx: number, cy: number, R: number): [number, number] {
  const ang = -Math.PI / 2 + dot.turn * TAU;
  return [cx + Math.cos(ang) * dot.r * R, cy + Math.sin(ang) * dot.r * R];
}
