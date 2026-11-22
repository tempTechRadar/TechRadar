import { test } from "node:test";
import assert from "node:assert/strict";
import { canUndoMark } from "./undo-mark.ts";

test("되돌리기: 다시 저장해도 알림이 판단되지 않는 전 상태(없음 · 관심)일 때만", () => {
  assert.equal(canUndoMark(null), true);
  assert.equal(canUndoMark("interest"), true);
  assert.equal(canUndoMark("candidate"), false);
  assert.equal(canUndoMark("hold"), false);
});
