import { test } from "node:test";
import assert from "node:assert/strict";
import { createPhysics } from "./physics.ts";

const run = (p: ReturnType<typeof createPhysics>, still = false) => { let n = 0; while (p.busy() && n++ < 2000) p.step(1 / 60, n / 60, still); return n; };

test("펼치기: 정해진 자리로 가서 멈추고, 그 자리가 새 제자리(rest)가 된다", () => {
  const p = createPhysics();
  p.sync([{ id: "a", x: 0, y: 0, r: 4 }]);
  p.settleTo([["a", [100, 50]]]);
  assert.ok(run(p) < 2000, "식는다");
  const b = p.B.get("a")!;
  assert.deepEqual([b.x, b.y, b.rest], [100, 50, [100, 50]]);
});

test("끌기: 끄는 점은 손을 따라가고, 줄로 이은 이웃은 끌려온다. 놓으면 식는다", () => {
  const p = createPhysics();
  p.sync([{ id: "hub", x: 0, y: 0, r: 10 }, { id: "leaf", x: 40, y: 0, r: 4 }]);
  p.kick("leaf", null, [["hub", "leaf"]]);
  for (let i = 0; i < 30; i++) { p.drag(40 + i * 5, 0); p.step(1 / 60, i / 60, false); }
  assert.equal(p.B.get("leaf")!.x, 185);
  assert.ok(p.B.get("hub")!.x > 5, "이웃이 끌려옴");
  p.release();
  assert.ok(run(p) < 2000);
});

test("겹친 점은 서로 밀어낸다, 움직임 줄이기면 흔들림 없이 바로 자리 잡는다", () => {
  const p = createPhysics();
  p.sync([{ id: "a", x: 0, y: 0, r: 5 }, { id: "b", x: 1, y: 0, r: 5 }]);
  p.kick(null, null, []);
  run(p, true);
  const a = p.B.get("a")!, b = p.B.get("b")!;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 1, "떨어짐");
});

test("보이지 않게 된 것은 몸에서 빠지고, 새로 보이는 것은 from 자리에서 나온다", () => {
  const p = createPhysics();
  p.sync([{ id: "a", x: 0, y: 0, r: 4 }, { id: "b", x: 10, y: 0, r: 4 }]);
  p.sync([{ id: "b", x: 10, y: 0, r: 4 }, { id: "c", x: 50, y: 50, r: 4 }], () => [7, 7]);
  assert.deepEqual([...p.B.keys()], ["b", "c"]);
  assert.deepEqual([p.B.get("c")!.x, p.B.get("c")!.y], [7, 7]);
});
