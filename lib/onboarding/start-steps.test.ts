import { test } from "node:test";
import assert from "node:assert/strict";
import { startSteps } from "./start-steps.ts";

test("시작하기: 못 읽으면 숨김, 다 하면 숨김, 아니면 한 것만 체크", () => {
  assert.equal(startSteps(null), null);
  assert.equal(startSteps({ projects: 1, unseenCheck: false, judged: true }), null);
  assert.deepEqual(startSteps({ projects: 1, unseenCheck: true, judged: false })?.map((s) => s.done), [true, false, false]);
  assert.deepEqual(startSteps({ projects: 0, unseenCheck: false, judged: false })?.map((s) => s.done), [false, false, false]); // 프로젝트 없으면 점검도 안 한 것
  assert.deepEqual(startSteps({ projects: 2, unseenCheck: false, judged: false })?.map((s) => s.done), [true, true, false]); // 띠가 없으면(실패 · 다른 기기에서 확인) 막히지 않음
});
