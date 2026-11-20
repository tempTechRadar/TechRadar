import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProjectEdit, MEMO_MAX, NAME_MAX } from "./project-edit.ts";

const ID = "11111111-2222-3333-4444-555555555555";

test("프로젝트 고치기: 이름은 다듬어 1~60자(코드 포인트), 빈 메모는 null", () => {
  assert.deepEqual(checkProjectEdit({ id: ID, name: "  내 앱  ", memo: "  " }), { ok: true, value: { id: ID, name: "내 앱", memo: null } });
  assert.deepEqual(checkProjectEdit({ id: ID, name: "👍".repeat(NAME_MAX), memo: "메모" }), { ok: true, value: { id: ID, name: "👍".repeat(NAME_MAX), memo: "메모" } });
});

test("프로젝트 고치기: id 모양 · 빈 이름 · 긴 이름 · 긴 메모 · 글이 아닌 값은 거절", () => {
  assert.deepEqual(checkProjectEdit({ id: "x", name: "a", memo: "" }), { ok: false, error: "project-id" });
  assert.deepEqual(checkProjectEdit({ id: ID, name: "   ", memo: "" }), { ok: false, error: "project-name" });
  assert.deepEqual(checkProjectEdit({ id: ID, name: "a".repeat(NAME_MAX + 1), memo: "" }), { ok: false, error: "project-name" });
  assert.deepEqual(checkProjectEdit({ id: ID, name: "a", memo: "m".repeat(MEMO_MAX + 1) }), { ok: false, error: "project-memo" });
  assert.deepEqual(checkProjectEdit({ id: ID, name: { evil: 1 }, memo: null }), { ok: false, error: "project-name" });
});
