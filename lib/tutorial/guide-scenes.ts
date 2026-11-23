// Tutorial(/guide) 단계 카드의 "살아 있는 시연 장면"(I-tutorial-motion): 가짜 커서가 움직여 누르고, 결과가 나타나는 작은 재생.
// 장면 = 박자(Beat) 배열인 순수 데이터다. 화면(app/guide/mocks.tsx)은 frameAt이 돌려주는 "켜진 상태 이름 · 쳐진 글자"만 보고 그린다.
// 그래서 어느 대목으로 건너뛰어도(행동 누르기 · 처음부터) 같은 그림이 나오고, 움직임 줄이기 · 스크립트 꺼짐에서는 끝 프레임(endFrame)이 정지 그림이 된다.
// 박자 하나의 시간표: [0, move) 커서가 to로 이동 → move 시점에 눌림 파문 + on/off 적용 → 글자 치기(type) → 남은 시간은 읽을 틈.
// 원칙(Maestro): 움직임은 설명이다 — 박자마다 "무엇을 누르면(to) 무엇이 생기나(on)"를 하나씩만 보여 준다.
import type { GuideStep } from "./guide-steps.ts";

/** 장면 설계 폭(px). 화면은 이 폭으로 그린 뒤 칸 폭에 맞춰 통째로 줄이거나 키운다 */
export const SCENE_W = 440;
/** 커서 이동 기본 길이(ms): 멀미 기준 600~900 */
export const MOVE_MS = 700;
/** 글자를 다 친 뒤 박자 끝까지 남기는 틈(ms) */
export const TYPE_TAIL_MS = 350;

export type Beat = {
  /** 이 박자가 속한 행동(그 단계 actions의 0부터 번호): 왼쪽 행동 목록 강조 · 진행 막대 칸과 짝 */
  a: number;
  /** 박자 길이(ms) */
  ms: number;
  /** 커서가 갈 곳: mocks.tsx의 t="이름" */
  to?: string;
  /** 커서 이동 길이(ms). 없으면 MOVE_MS */
  move?: number;
  /** 도착하면 눌림 파문 */
  press?: boolean;
  /** 이동하는 동안 커서가 기술 칩을 끌고 간다(청사진 짜기) */
  carry?: boolean;
  /** 도착한 뒤 칸에 글자가 한 자씩 쳐진다 */
  type?: { at: string; text: string };
  /** 도착 시점에 켜지는 · 꺼지는 상태 이름: mocks.tsx의 f.on("이름") */
  on?: string[];
  off?: string[];
};
export type Scene = { /** 설계 높이(px, 폭은 SCENE_W) */ h: number; beats: Beat[] };
export type Frame = { /** 켜진 상태 이름(가나다 · 알파벳 순) */ flags: string[]; /** 칸 이름 → 지금까지 쳐진 글자 */ typed: Record<string, string>; /** 지금 행동(0부터) */ action: number };

export const SCENES: Record<GuideStep["id"], Scene> = {
  // ① 「로그인」 → 「구글로 계속하기」 → 별명 칸에 글자 → 「저장」 → 「건너뛰기」
  start: { h: 262, beats: [
    { a: 0, ms: 1500, to: "login", move: 800, press: true, on: ["door"] },
    { a: 0, ms: 1700, to: "google", press: true, on: ["welcome"] },
    { a: 1, ms: 2000, to: "nick", press: true, type: { at: "nick", text: "내 별명" } },
    { a: 1, ms: 1700, to: "save", move: 600, press: true, on: ["saved", "taste"] },
    { a: 2, ms: 2100, to: "skip", move: 800, press: true, on: ["skipped"] },
  ] },
  // ② 주소가 쳐짐 → 「등록하고 읽기」 → 읽는 중… → 첫 점검 띠 → 숫자 띠 6칸이 차례로 → 레포 이름
  protect: { h: 292, beats: [
    { a: 0, ms: 2700, to: "url", move: 800, press: true, type: { at: "url", text: "https://github.com/owner/repo" } },
    { a: 1, ms: 1600, to: "reg", press: true, on: ["reading"] },
    { a: 2, ms: 1200, on: ["check"], off: ["reading"] },
    { a: 2, ms: 2000, on: ["band"] },
    { a: 3, ms: 2100, to: "repo", move: 900, press: true, on: ["detail"] },
  ] },
  // ③ 칩 → 점이 걸러짐 → 점 하나 → 상세 패널 → 「청사진에 담기」 → 메뉴 청사진 배지
  choose: { h: 300, beats: [
    { a: 0, ms: 2300, to: "chip", move: 800, press: true, on: ["filtered"] },
    { a: 1, ms: 2400, to: "dot", press: true, on: ["panel"] },
    { a: 2, ms: 2700, to: "cart", move: 800, press: true, on: ["carted"] },
  ] },
  // ④ 종 → 알림 종류 → 「써 볼 후보로」 → "판단을 남겼을 뿐…" → 「다음 판단 대기 →」
  judge: { h: 388, beats: [
    { a: 0, ms: 1900, to: "bell", move: 800, press: true, on: ["kinds"] },
    { a: 1, ms: 2300, to: "kind", move: 800, on: ["look"] },
    { a: 2, ms: 1400, to: "kind", move: 0, press: true, on: ["card"] },
    { a: 2, ms: 2300, to: "go", press: true, on: ["judged"] },
    { a: 3, ms: 1700, to: "next", move: 800, press: true },
  ] },
  // ⑤ 「＋ 단계」 → 기술 칩이 단계로 끌려가 붙음 → 「잇기」 → 단계 사이 선
  compose: { h: 318, beats: [
    { a: 0, ms: 1900, to: "add", move: 800, press: true, on: ["stage2"] },
    { a: 1, ms: 1400, to: "tech", press: true, on: ["grab"] },
    { a: 1, ms: 2200, to: "drop", move: 900, carry: true, on: ["dropped"], off: ["grab"] },
    { a: 2, ms: 2400, to: "link", move: 900, press: true, on: ["linked"] },
  ] },
  // ⑥ 「확정 · 내보내기」 → 형식 → 「복사」 → 토스트 → 「이대로 확정」
  export: { h: 366, beats: [
    { a: 0, ms: 1800, to: "open", move: 800, press: true, on: ["dialog"] },
    { a: 1, ms: 1900, to: "kind", press: true, on: ["kind"] },
    { a: 2, ms: 2600, to: "copy", press: true, on: ["copied"] },
    { a: 3, ms: 2200, to: "confirm", move: 800, press: true, on: ["confirmed"] },
  ] },
};

/** 이 박자에서 커서가 움직이는 길이(ms). 갈 곳이 없으면 0 */
export const moveMs = (b: Beat): number => (b.to ? b.move ?? MOVE_MS : 0);
/** 장면 전체 길이(ms) */
export const sceneMs = (s: Scene): number => s.beats.reduce((sum, b) => sum + b.ms, 0);
/** 그 행동이 시작하는 박자 번호. 없으면 -1(시험이 모든 행동에 박자가 있음을 지킨다) */
export const firstBeatOf = (s: Scene, action: number): number => s.beats.findIndex((b) => b.a === action);

/** 박자 i 안에서 t(ms)일 때 쳐진 글자 수: 도착(move) 뒤부터 박자 끝 TYPE_TAIL_MS 전까지 고르게 */
export function typedCount(b: Beat, t: number): number {
  if (!b.type) return 0;
  const len = [...b.type.text].length, start = moveMs(b), span = Math.max(1, b.ms - start - TYPE_TAIL_MS);
  return Math.min(len, Math.max(0, Math.floor(((t - start) / span) * len)));
}

/** 박자 i · 그 안의 t(ms)에서 보이는 그림. i가 박자 수 이상이면 끝 프레임 */
export function frameAt(s: Scene, i: number, t: number): Frame {
  const flags = new Set<string>(), typed: Record<string, string> = {};
  const n = Math.min(Math.max(0, i), s.beats.length);
  s.beats.forEach((b, k) => {
    const whole = k < n, arrived = whole || (k === n && t >= moveMs(b));
    if (k > n || !arrived) return;
    for (const f of b.on ?? []) flags.add(f);
    for (const f of b.off ?? []) flags.delete(f);
    if (b.type) typed[b.type.at] = whole ? b.type.text : [...b.type.text].slice(0, typedCount(b, t)).join("");
  });
  return { flags: [...flags].sort(), typed, action: s.beats[Math.min(n, s.beats.length - 1)].a };
}
/** 끝 프레임 = 정지 그림(움직임 줄이기 · 스크립트 꺼짐 · 재생이 끝난 뒤) */
export const endFrame = (s: Scene): Frame => frameAt(s, s.beats.length, 0);

/** 박자 i에서 커서가 떠나는 곳(앞 박자들 가운데 마지막 to). 없으면 null = 장면 구석의 대기 자리 */
export function cursorFrom(s: Scene, i: number): string | null {
  for (let k = Math.min(i, s.beats.length) - 1; k >= 0; k--) if (s.beats[k].to) return s.beats[k].to!;
  return null;
}

/** 지금 행동 칸이 얼마나 찼는지 0 → 1(진행 막대): 그 행동에 속한 박자들의 시간 가운데 지난 몫 */
export function actionProgress(s: Scene, i: number, t: number): number {
  if (i >= s.beats.length) return 1;
  const a = s.beats[i].a;
  let total = 0, past = 0;
  s.beats.forEach((b, k) => { if (b.a !== a) return; total += b.ms; if (k < i) past += b.ms; else if (k === i) past += Math.min(b.ms, Math.max(0, t)); });
  return total ? past / total : 1;
}

/** 부드러운 출발 · 도착(커서 이동): 0 → 1 */
export const easeInOut = (p: number): number => { const x = Math.min(1, Math.max(0, p)); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; };
