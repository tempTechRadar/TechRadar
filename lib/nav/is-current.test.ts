import { test } from "node:test";
import assert from "node:assert/strict";
import { isCurrent } from "./is-current.ts";

test("지금 화면 표시: 같은 주소와 하위 주소만, 이름이 겹치는 다른 주소는 아님", () => {
  assert.equal(isCurrent("/views", "/views"), true);
  assert.equal(isCurrent("/alerts/abc", "/alerts"), true);
  assert.equal(isCurrent("/views-old", "/views"), false);
  assert.equal(isCurrent("/new", "/"), false);
  assert.equal(isCurrent("/", "/"), true);
});
