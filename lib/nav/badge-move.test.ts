import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeLabel, nextBadge } from "./badge-move.ts";

const at = (n: number | null) => ({ n, dir: null });

test("종 배지: 보이는 수가 바뀔 때만 한 번 움직인다(늘면 up, 줄면 down)", () => {
  assert.deepEqual(nextBadge(at(3), 2, true), { n: 2, dir: "down" });
  assert.deepEqual(nextBadge(at(2), 5, true), { n: 5, dir: "up" });
});

test("종 배지: 첫 그림 · 못 읽음↔숫자 · 종을 펼쳐 바로잡은 값 · 0으로 사라짐 · 99+ 안에서의 변화는 움직이지 않는다", () => {
  const same = at(3);
  assert.equal(nextBadge(same, 3, true), same, "같은 값이면 그대로(다시 그려도 움직임 없음)");
  assert.deepEqual(nextBadge(at(null), 3, true), { n: 3, dir: null });
  assert.deepEqual(nextBadge(at(3), null, true), { n: null, dir: null });
  assert.deepEqual(nextBadge(at(3), 2, false), { n: 2, dir: null }, "종 펼침 보정");
  assert.deepEqual(nextBadge(at(1), 0, true), { n: 0, dir: null }, "0이면 배지를 그냥 뺀다");
  assert.deepEqual(nextBadge(at(120), 130, true), { n: 130, dir: null }, "글이 99+로 같음");
  assert.deepEqual([badgeLabel(0), badgeLabel(null), badgeLabel(7), badgeLabel(100)], [null, null, "7", "99+"]);
});
