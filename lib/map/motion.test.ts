import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TUNE, grow, GROW, introducing, retune, REVEAL, rippleR, ringGrow, SLOWDOWN, sweepAlpha, sweepAngle, touchAge, TUNE, TUNES, type MotionState } from "./motion.ts";
import type { Item } from "./layout.ts";

const item = (id: string, x: number, y: number, parent: string | null = null) => ({ id, x, y, parent, type: "t" }) as unknown as Item;
const parent = item("p", 0, -100); // 위쪽(먼저 지나감)
const child = item("c", 100, 0, "p"); // 오른쪽(나중)
const early = item("e", 0, -200, "late");
const late = item("late", -100, 0); // 왼쪽(맨 나중)
const S = (over: Partial<MotionState> = {}): MotionState => ({
  still: false, motion: "sweep", tune: "base", shift: 0, introAt: 10, sweepStart: 10.5, W: 1000, H: 800, cam: { x: 0, y: 0 }, scale: () => 1,
  L: { radius: 300, byId: new Map([parent, child, early, late].map((i) => [i.id, i])) }, ...over,
});

test("선 각도: 펼침이 끝나는 순간 끊기지 않고, 빛남에 쓰는 속도가 각도의 변화와 맞는다", () => {
  const s = S(), end = s.sweepStart + REVEAL;
  assert.ok(Math.abs(sweepAngle(s, end - 1e-6) - sweepAngle(s, end + 1e-6)) < 1e-4, "펼침 끝에서 이어짐");
  for (const t of [end + 0.1, end + 0.5, end + 3]) {
    const dt = 1e-4, w = (sweepAngle(s, t + dt) - sweepAngle(s, t - dt)) / (2 * dt);
    const it = item("x", Math.cos(sweepAngle(s, t) - 0.01) * 50, Math.sin(sweepAngle(s, t) - 0.01) * 50); // 선 바로 뒤 0.01라디안
    assert.ok(Math.abs(touchAge(s, t, it) - 0.01 / w) < 0.01, `t=${t}`);
  }
  assert.ok(sweepAlpha(s, end + 10) < 1 && sweepAlpha(s, end + 10) > 0, "펼친 뒤에는 옅게 남음");
});

test("펼침: 선이 지나간 순서로 떠오르되 부모보다 먼저 나오지 않고, 끄기 · 움직임 줄이기면 처음부터 다 보임", () => {
  const s = S(), t = s.sweepStart + REVEAL * 0.15; // 위쪽만 지난 때(오른쪽은 한 바퀴의 1/4)
  assert.ok(grow(s, t, parent) > 0, "위쪽 부모는 떠오름");
  assert.equal(grow(s, t, child), 0, "오른쪽 자식은 아직");
  assert.equal(grow(s, t, early), 0, "자식이 위쪽에 있어도 부모(왼쪽)보다 먼저 나오지 않음");
  assert.equal(grow(s, s.sweepStart + REVEAL + GROW + 0.01, late), 1);
  assert.equal(introducing(s, s.sweepStart + REVEAL + GROW + 0.01), false);
  assert.equal(grow(S({ motion: "off" }), t, child), 1);
  assert.equal(grow(S({ still: true }), t, child), 1);
  assert.equal(sweepAlpha(S({ motion: "off" }), t), 0);
  assert.ok(ringGrow(s, 10.05, 1) < ringGrow(s, 10.3, 1), "고리는 안쪽부터 퍼져 나옴");
  assert.ok(ringGrow(s, 10.3, 1) > ringGrow(s, 10.3, 5), "바깥 고리는 늦게");
});

test("분위기: 기본은 잔잔하게, 잔잔할수록 느리고 파동 간격이 넓고 잔광이 길다", () => {
  assert.equal(DEFAULT_TUNE, "calm");
  const [calm, base, vivid] = TUNES.map((t) => TUNE[t]);
  for (const k of ["ambient", "ripple", "rippleGrow", "trail"] as const) assert.ok(calm[k] > base[k] && base[k] > vivid[k], k);
  for (const t of TUNES) assert.ok(TUNE[t].rippleGrow < TUNE[t].ripple, `${t}: 파동 사이에 틈`);
});

test("분위기를 바꿔도 선 · 파동이 제자리에서 이어 가고, 시작 시계(위험 맥박 10초)는 그대로", () => {
  const wrap = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  for (const motion of ["sweep", "ripple"] as const) for (const from of TUNES) for (const to of TUNES) for (const extra of [0.3, 4.1, 37.3]) {
    const s = S({ motion, tune: from, shift: 1.7 }), t = s.sweepStart + REVEAL + SLOWDOWN + extra, moved = S({ motion, tune: to, shift: retune(s, t, to) });
    const tag = `${motion} ${from}→${to} +${extra}`;
    if (motion === "sweep") assert.ok(Math.abs(wrap(sweepAngle(moved, t)) - wrap(sweepAngle(s, t))) < 1e-6, `${tag}: 같은 각도`);
    else {
      const a = rippleR(s, t, 500), b = rippleR(moved, t, 500);
      assert.ok(Math.abs(a.r - b.r) < 1e-6 && Math.abs(a.fade - b.fade) < 1e-6, `${tag}: 같은 고리 ${a.r} ${b.r}`);
    }
    assert.ok(t - REVEAL - moved.sweepStart + moved.shift >= SLOWDOWN, `${tag}: 감속 뒤`);
  }
  const s = S();
  assert.equal(retune(s, s.sweepStart + 1, "calm"), 0, "펼침 중엔 그대로");
  assert.equal(retune(S({ motion: "off", shift: 2 }), s.sweepStart + 30, "calm"), 2, "끄기면 그대로");
  const gap = (tune: "calm" | "vivid") => { const x = S({ motion: "ripple", tune }); let n = 0; for (let k = 0; k < 600; k++) if (rippleR(x, x.sweepStart + REVEAL + k / 10, 500).r < 0) n++; return n; };
  assert.ok(gap("calm") > gap("vivid"), "잔잔하면 파동 없는 틈이 길다");
});
