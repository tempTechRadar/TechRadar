import { test } from "node:test";
import assert from "node:assert/strict";
import { grow, GROW, introducing, litAge, litAt, MOTION_END, PING, RECENT_HOURS, recentlyChecked, REVEAL, rippleR, ringGrow, SLOWDOWN, sweepAlpha, sweepAngle, trackTargets, TURNS, type MotionState } from "./motion.ts";
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

test("선 각도: 두 바퀴(TURNS)를 돈 뒤 감속으로 끊기지 않게 이어지고 옅어진다(P-12m)", () => {
  const s = S(), end = s.sweepStart + REVEAL * TURNS;
  assert.ok(Math.abs(sweepAngle(s, end - 1e-6) - sweepAngle(s, end + 1e-6)) < 1e-4, "두 바퀴 끝에서 이어짐");
  assert.ok(Math.abs(sweepAngle(s, end) - sweepAngle(s, s.sweepStart) - TURNS * Math.PI * 2) < 1e-9, "두 바퀴");
  assert.equal(sweepAlpha(s, s.sweepStart + REVEAL * 1.5), 1, "둘째 바퀴 동안은 진함");
  assert.equal(sweepAlpha({ ...s, motion: "ripple" }, s.sweepStart + 1), 0, "파동만이면 선 없음");
  const fading = sweepAlpha(s, end + SLOWDOWN / 2);
  assert.ok(fading > 0 && fading < 1, "감속 동안 옅어짐");
  assert.equal(sweepAlpha(s, end + SLOWDOWN), 0, "감속이 끝나면 선이 사라져 멈춤(계속 돌지 않음, P-12g)");
  assert.equal(sweepAlpha(s, end + 10), 0);
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

test("최근 확인(선이 지날 때 빛남): 수집 오류 없이 36시간 안에 확인한 것만, 확인한 적 없음 · 오래됨 · 오류는 아님", () => {
  const now = Date.parse("2026-11-22T12:00:00Z"), hours = (h: number) => new Date(now - h * 3_600_000).toISOString();
  assert.equal(recentlyChecked({ lastCheckedOkAt: hours(RECENT_HOURS), collectErrorKind: null }, now), true, "36시간 딱 맞으면 최근");
  assert.equal(recentlyChecked({ lastCheckedOkAt: hours(RECENT_HOURS + 0.01), collectErrorKind: null }, now), false, "넘으면 아님");
  assert.equal(recentlyChecked({ lastCheckedOkAt: null, collectErrorKind: null }, now), false, "확인한 적 없음");
  assert.equal(recentlyChecked({ lastCheckedOkAt: hours(1), collectErrorKind: "timeout" }, now), false, "수집 오류면 최근이라도 아님(불변 2)");
  assert.equal(recentlyChecked({ lastCheckedOkAt: "읽을 수 없음", collectErrorKind: null }, now), false);
});

test("파동은 한 번: 펼침 끝에서 가운데로 돌아가지 않고 화면 끝까지 옅어지며 퍼진 뒤 사라진다", () => {
  const s = { ...S(), motion: "ripple" as const }, end = s.sweepStart + REVEAL, far = 900;
  assert.ok(rippleR(s, end + 0.01, far).r >= rippleR(s, end - 0.01, far).r, "지도 끝에서 바깥으로 이어짐");
  assert.ok(rippleR(s, end + SLOWDOWN / 2, far).fade < 1);
  assert.equal(rippleR(s, end + SLOWDOWN, far).r, -1, "감속이 끝나면 없음");
  assert.equal(rippleR(s, end + 30, far).r, -1, "다시 생기지 않음");
});

test("선 + 파동(both, P-12m): 점은 선(첫 바퀴)과 첫 파동 중 먼저 닿는 시각에 한 번만 켜지고, 두 바퀴 · 세 파동이 지나도 다시 켜지지 않는다", () => {
  const s = S({ motion: "both" }), nearLate = item("n", -30, 0), farEarly = item("f", 1, -290); // 가운데 가까운 왼쪽(파동이 먼저) · 바깥 위쪽(선이 먼저)
  const bySweep = (it: ReturnType<typeof item>) => litAt({ ...s, motion: "sweep" }, it), byRipple = (it: ReturnType<typeof item>) => litAt({ ...s, motion: "ripple" }, it);
  assert.ok(byRipple(nearLate) < bySweep(nearLate) && litAt(s, nearLate) === byRipple(nearLate), "파동이 먼저면 파동 시각");
  assert.ok(bySweep(farEarly) < byRipple(farEarly) && litAt(s, farEarly) === bySweep(farEarly), "선이 먼저면 선 시각");
  for (const it of [nearLate, farEarly]) { // 연출 내내 ping 구간(0 ≤ 나이 < PING)에 들어가는 일은 한 번뿐
    let edges = 0, was = false;
    for (let t = s.sweepStart - 1; t < s.sweepStart + MOTION_END + 2; t += 0.01) { const a = litAge(s, t, it), on = a >= 0 && a < PING; if (on && !was) edges++; was = on; }
    assert.equal(edges, 1, it.id);
  }
  assert.equal(litAge(S({ motion: "off" }), 11, nearLate), -1, "끄기면 끝난 모습(켜짐 움직임 없음)");
  assert.equal(litAge(S({ still: true }), 11, nearLate), -1, "움직임 줄이기면 끝난 모습");
  assert.ok(grow(s, litAt(s, nearLate) + GROW, nearLate) === 1 && grow(s, litAt(s, nearLate) - 0.01, nearLate) === 0, "떠오르는 때도 같은 시각");
});

test("새 기술 추적 틀: NEW(이번 주) 기술 중 들어온 기록이 있는 것만, 최근 들어온 순으로 최대 n개", () => {
  const t = (id: string, isNew: boolean, addedAt: string | null) => ({ id, node: { isNew, addedAt } });
  const list = [t("old", false, "2026-11-22T00:00:00Z"), t("a", true, "2026-11-18T00:00:00Z"), t("b", true, "2026-11-22T00:00:00Z"), t("c", true, "2026-11-20T00:00:00Z"), t("x", true, null)];
  assert.deepEqual(trackTargets(list, 2).map((i) => i.id), ["b", "c"]);
  assert.deepEqual(trackTargets(list).map((i) => i.id), ["b", "c", "a"], "NEW가 아니거나 들어온 기록이 없으면 틀 없음");
});
