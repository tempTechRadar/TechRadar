import { test } from "node:test";
import assert from "node:assert/strict";
import { easeOutBack, tween } from "./tween.ts";

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

test("easeOutBack: 0에서 시작해 1에서 끝나고, 끝 가까이에서 살짝 넘었다 돌아온다(범위 밖 t는 자름)", () => {
  near(easeOutBack(0), 0);
  assert.equal(easeOutBack(1), 1);
  assert.ok(easeOutBack(0.8) > 1 && easeOutBack(0.8) < 1.05);
  near(easeOutBack(-1), 0);
  assert.equal(easeOutBack(2), 1);
});

test("tween: from → to 사이, 넘으면 지나간 자리, from에 없는 단계는 도착 자리", () => {
  const from = new Map([["a", { x: 0, y: 0 }]]), to = new Map([["a", { x: 100, y: 10 }], ["b", { x: 5, y: 5 }]]);
  assert.deepEqual(tween(from, to, 0.5).get("a"), { x: 50, y: 5 });
  near(tween(from, to, 1.1).get("a")!.x, 110);
  assert.deepEqual(tween(from, to, 0).get("b"), { x: 5, y: 5 });
});
