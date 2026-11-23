import assert from "node:assert/strict";
import test from "node:test";
import { nextPendingId } from "./next-pending.ts";

const a = (id: string, status: "pending" | "done", createdAt: string) => ({ id, status, createdAt });

test("다음 판단 대기: 지금 알림과 완료는 빼고 가장 최근 판단 대기, 없으면 null", () => {
  const list = [a("old", "pending", "2026-11-20T00:00:00Z"), a("now", "pending", "2026-11-23T00:00:00Z"), a("new", "pending", "2026-11-22T00:00:00Z"), a("done", "done", "2026-11-23T05:00:00Z")];
  assert.equal(nextPendingId(list, "now"), "new");
  assert.equal(nextPendingId(list, "new"), "now");
  assert.equal(nextPendingId([a("now", "pending", "2026-11-23T00:00:00Z"), a("done", "done", "2026-11-22T00:00:00Z")], "now"), null);
  assert.equal(nextPendingId([], "now"), null);
});
