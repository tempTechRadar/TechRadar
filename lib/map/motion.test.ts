import { test } from "node:test";
import assert from "node:assert/strict";
import { grow, GROW, idleAngle, introducing, litAge, litAt, MOTION_END, PING, placeTags, RECENT_HOURS, recentlyChecked, REVEAL, RISE, RISE_SEC, riseAge, riseAt, rippleR, ringGrow, SLOWDOWN, trackTargets, type MotionState } from "./motion.ts";
import type { Item } from "./layout.ts";

const item = (id: string, x: number, y: number, parent: string | null = null) => ({ id, x, y, parent, type: "t" }) as unknown as Item;
const parent = item("p", 0, -50); // 가운데 가까이(먼저 닿음)
const child = item("c", 200, 0, "p"); // 바깥(나중)
const early = item("e", 0, -30, "late");
const late = item("late", -250, 0); // 가장 바깥(맨 나중)
const S = (over: Partial<MotionState> = {}): MotionState => ({
  still: false, motion: "ripple", introAt: 10, sweepStart: 10.5, W: 1000, H: 800, cam: { x: 0, y: 0 }, scale: () => 1,
  L: { radius: 300, byId: new Map([parent, child, early, late].map((i) => [i.id, i])) }, ...over,
});

test("뒤에서 도는 옅은 선(P-12p): 위에서 시작해 speed초에 한 바퀴, 1초보다 빠르게 돌지 않는다", () => {
  assert.equal(idleAngle(0, 18), -Math.PI / 2, "위에서 시작");
  assert.ok(Math.abs(idleAngle(4.5, 18)) < 1e-9, "한 바퀴의 1/4이면 오른쪽");
  assert.ok(Math.abs(idleAngle(18, 18) - idleAngle(0, 18)) < 1e-9, "speed초 뒤 제자리");
  assert.equal(idleAngle(0.5, 0), idleAngle(0.5, 1), "0초 한 바퀴는 1초로");
});

test("펼침: 파동이 닿는 순서(가운데에서 거리 순)로 떠오르되 부모보다 먼저 나오지 않고, 끄기 · 움직임 줄이기면 처음부터 다 보임", () => {
  const s = S(), t = s.sweepStart + REVEAL * 0.25; // 거리 75까지 닿은 때
  assert.ok(grow(s, t, parent) > 0, "가까운 부모는 떠오름");
  assert.equal(grow(s, t, child), 0, "바깥 자식은 아직");
  assert.equal(grow(s, t, early), 0, "자식이 가까이 있어도 부모(바깥)보다 먼저 나오지 않음");
  assert.equal(grow(s, s.sweepStart + REVEAL + GROW + 0.01, late), 1);
  assert.equal(introducing(s, s.sweepStart + REVEAL + GROW + 0.01), false);
  assert.equal(grow(S({ motion: "off" }), t, child), 1);
  assert.equal(grow(S({ still: true }), t, child), 1);
  assert.ok(ringGrow(s, 10.05, 1) < ringGrow(s, 10.3, 1), "고리는 안쪽부터 퍼져 나옴");
  assert.ok(ringGrow(s, 10.3, 1) > ringGrow(s, 10.3, 5), "바깥 고리는 늦게");
});

test("떠오름(P-12p): 닿기 전엔 아래, 닿은 뒤 위로 올라와 살짝 넘쳤다 흔들리며 RISE_SEC 뒤 제자리", () => {
  assert.equal(riseAt(-0.1), RISE, "닿기 전은 아래");
  assert.equal(riseAt(0), RISE, "닿는 순간 아래에서 시작");
  assert.ok(riseAt(0.25) < 0, "한 번 위로 넘침");
  assert.ok(Math.abs(riseAt(0.6)) < RISE / 4, "점점 잦아듦");
  assert.equal(riseAt(RISE_SEC), 0, "멈춤");
  assert.equal(riseAt(Number.NaN), RISE, "잘못된 값은 닿기 전으로");
  const s = S(), t = litAt(s, late) + 0.1;
  assert.ok(Math.abs(riseAge(s, t, early) - riseAge(s, t, late)) < 1e-9, "부모(바깥)를 기다린 자식은 부모와 함께 떠오름(안 보이는 동안 흔들리지 않게)");
  assert.equal(riseAge(S({ motion: "off" }), t, early), -1);
});

test("최근 확인(파동이 닿을 때 빛남): 수집 오류 없이 36시간 안에 확인한 것만, 확인한 적 없음 · 오래됨 · 오류는 아님", () => {
  const now = Date.parse("2026-11-22T12:00:00Z"), hours = (h: number) => new Date(now - h * 3_600_000).toISOString();
  assert.equal(recentlyChecked({ lastCheckedOkAt: hours(RECENT_HOURS), collectErrorKind: null }, now), true, "36시간 딱 맞으면 최근");
  assert.equal(recentlyChecked({ lastCheckedOkAt: hours(RECENT_HOURS + 0.01), collectErrorKind: null }, now), false, "넘으면 아님");
  assert.equal(recentlyChecked({ lastCheckedOkAt: null, collectErrorKind: null }, now), false, "확인한 적 없음");
  assert.equal(recentlyChecked({ lastCheckedOkAt: hours(1), collectErrorKind: "timeout" }, now), false, "수집 오류면 최근이라도 아님(불변 2)");
  assert.equal(recentlyChecked({ lastCheckedOkAt: "읽을 수 없음", collectErrorKind: null }, now), false);
});

test("파동은 한 번: 펼침 끝에서 가운데로 돌아가지 않고 화면 끝까지 옅어지며 퍼진 뒤 사라진다", () => {
  const s = S(), end = s.sweepStart + REVEAL, far = 900;
  assert.ok(rippleR(s, end + 0.01, far).r >= rippleR(s, end - 0.01, far).r, "지도 끝에서 바깥으로 이어짐");
  assert.ok(rippleR(s, end + SLOWDOWN / 2, far).fade < 1);
  assert.equal(rippleR(s, end + SLOWDOWN + 1e-9, far).r, -1, "감속이 끝나면 없음");
  assert.equal(rippleR(s, end + 30, far).r, -1, "다시 생기지 않음");
});

test("파동(P-12p): 점은 첫 파동이 닿는 시각(가운데에서 거리 순)에 한 번만 켜지고, 잔물결이 지나도 다시 켜지지 않는다", () => {
  const s = S(), near = item("n", -30, 0), far = item("f", 1, -290);
  assert.ok(litAt(s, near) < litAt(s, far), "가까운 점이 먼저");
  assert.equal(litAt(s, item("x", 900, 0)), s.sweepStart + REVEAL, "지도 밖은 펼침 끝에");
  for (const it of [near, far]) { // 연출 내내 ping 구간(0 ≤ 나이 < PING)에 들어가는 일은 한 번뿐
    let edges = 0, was = false;
    for (let t = s.sweepStart - 1; t < s.sweepStart + MOTION_END + 2; t += 0.01) { const a = litAge(s, t, it), on = a >= 0 && a < PING; if (on && !was) edges++; was = on; }
    assert.equal(edges, 1, it.id);
  }
  assert.equal(litAge(S({ motion: "off" }), 11, near), -1, "끄기면 끝난 모습(켜짐 움직임 없음)");
  assert.equal(litAge(S({ still: true }), 11, near), -1, "움직임 줄이기면 끝난 모습");
  assert.ok(grow(s, litAt(s, near) + GROW, near) === 1 && grow(s, litAt(s, near) - 0.01, near) === 0, "떠오르는 때도 같은 시각");
});

test("새 기술 추적 틀: NEW(이번 주) 기술 중 들어온 기록이 있는 것만, 최근 들어온 순으로 최대 n개", () => {
  const t = (id: string, isNew: boolean, addedAt: string | null) => ({ id, node: { isNew, addedAt } });
  const list = [t("old", false, "2026-11-22T00:00:00Z"), t("a", true, "2026-11-18T00:00:00Z"), t("b", true, "2026-11-22T00:00:00Z"), t("c", true, "2026-11-20T00:00:00Z"), t("x", true, null)];
  assert.deepEqual(trackTargets(list, 2).map((i) => i.id), ["b", "c"]);
  assert.deepEqual(trackTargets(list).map((i) => i.id), ["b", "c", "a"], "NEW가 아니거나 들어온 기록이 없으면 틀 없음");
});

test("추적 틀 꼬리표: 같은 점에 다른 꼬리표가 있으면 빼고, 이름표나 앞 꼬리표와 겹치면 뺀다(틀은 그리는 쪽이 따로 남김)", () => {
  const name: [number, number, number, number] = [100, 100, 80, 16];
  const picked = placeTags([
    { item: "a", box: [0, 0, 90, 18], busy: false },
    { item: "b", box: [40, 5, 90, 18], busy: false }, // a와 겹침
    { item: "c", box: [90, 95, 90, 18], busy: false }, // 이름표와 겹침
    { item: "d", box: [300, 300, 90, 18], busy: true }, // 등급 · 판단 꼬리표가 이미 있음
    { item: "e", box: [300, 0, 90, 18], busy: false },
  ], [name]);
  assert.deepEqual(picked, ["a", "e"]);
});
