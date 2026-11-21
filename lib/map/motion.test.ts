import { test } from "node:test";
import assert from "node:assert/strict";
import { grow, GROW, introducing, REVEAL, ringGrow, sweepAlpha, sweepAngle, touchAge, type MotionState } from "./motion.ts";
import type { Item } from "./layout.ts";

const item = (id: string, x: number, y: number, parent: string | null = null) => ({ id, x, y, parent, type: "t" }) as unknown as Item;
const parent = item("p", 0, -100); // 위쪽(먼저 지나감)
const child = item("c", 100, 0, "p"); // 오른쪽(나중)
const early = item("e", 0, -200, "late");
const late = item("late", -100, 0); // 왼쪽(맨 나중)
const S = (over: Partial<MotionState> = {}): MotionState => ({
  still: false, motion: "sweep", introAt: 10, sweepStart: 10.5, W: 1000, H: 800, cam: { x: 0, y: 0 }, scale: () => 1,
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
