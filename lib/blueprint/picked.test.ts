import { test } from "node:test";
import assert from "node:assert/strict";
import { addPicked, PICKED_MAX, readPicked, removePicked } from "./picked.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("담은 목록 읽기: 깨진 글 · 배열 아님 · 없음은 빈 목록, uuid만 · 겹침 없이 · 30개까지", () => {
  assert.deepEqual(readPicked(null), []);
  assert.deepEqual(readPicked("{깨짐"), []);
  assert.deepEqual(readPicked('{"a":1}'), []);
  assert.deepEqual(readPicked(JSON.stringify([id(1), "x", 3, id(1), id(2)])), [id(1), id(2)]);
  assert.equal(readPicked(JSON.stringify(Array.from({ length: 40 }, (_, i) => id(i)))).length, PICKED_MAX);
});

test("담기 · 빼기: 이미 있으면 그대로, 30개면 안 넣음, uuid가 아니면 안 넣음", () => {
  const one = addPicked([], id(1));
  assert.deepEqual(one, { list: [id(1)], result: "added" });
  assert.deepEqual(addPicked(one.list, id(1)), { list: one.list, result: "exists" });
  const full = Array.from({ length: PICKED_MAX }, (_, i) => id(i + 10));
  assert.equal(addPicked(full, id(1)).result, "full");
  assert.equal(addPicked([], "../x").result, "bad");
  assert.deepEqual(removePicked([id(1), id(2)], id(1)), [id(2)]);
});
