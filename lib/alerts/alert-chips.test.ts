import { test } from "node:test";
import assert from "node:assert/strict";
import { chipHref, currentOf } from "./alert-chips.ts";

test("칩 주소: 값 하나만 바꾸고 나머지 거르기는 그대로, 빈 값·모르는 칸은 싣지 않는다", () => {
  assert.equal(chipHref({ kind: "security", period: "7d" }, "status", "pending"), "/alerts?kind=security&status=pending&period=7d");
  assert.equal(chipHref({ status: "pending" }, "status", ""), "/alerts");
  assert.equal(chipHref({ status: "pending", evil: "x" } as never, "kind", "opportunity"), "/alerts?kind=opportunity&status=pending");
});

test("지금 고른 칩: 칩에 없는 값은 전체로 본다", () => {
  assert.equal(currentOf("pending", ["pending", "done"]), "pending");
  assert.equal(currentOf("foo", ["pending", "done"]), "");
  assert.equal(currentOf(undefined, ["pending", "done"]), "");
});
