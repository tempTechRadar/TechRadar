import { test } from "node:test";
import assert from "node:assert/strict";
import { orderNotes } from "./note-view.ts";

const note = (id: string, helpfulCount: number, createdAt: string) => ({ id, usedFor: "u", result: "r", tip: "t", helpfulCount, createdAt, mine: false, voted: false, reported: false });

test("사용기: 도움 많은 순 → 새것 순, 기본은 위 3개, 모두 보기는 전부", () => {
  const notes = [note("a", 1, "2026-11-20"), note("b", 5, "2026-11-18"), note("c", 1, "2026-11-21"), note("d", 0, "2026-11-22")];
  assert.deepEqual(orderNotes(notes, false).map((n) => n.id), ["b", "c", "a"]);
  assert.deepEqual(orderNotes(notes, true).map((n) => n.id), ["b", "c", "a", "d"]);
  assert.deepEqual(notes.map((n) => n.id), ["a", "b", "c", "d"]); // 원본은 그대로
});
