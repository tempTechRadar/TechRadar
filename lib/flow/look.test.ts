import { test } from "node:test";
import assert from "node:assert/strict";
import { LOOK } from "./look.ts";

test("상태마다 색과 함께 글자 이름이 있다(색만으로 상태를 말하지 않음, PRD-NF5)", () => {
  for (const [state, look] of Object.entries(LOOK)) assert.ok(look.label.trim().length > 0, state);
  assert.equal(new Set(Object.values(LOOK).map((l) => l.label)).size, Object.keys(LOOK).length);
});
