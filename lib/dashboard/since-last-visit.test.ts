import { test } from "node:test";
import assert from "node:assert/strict";
import { countNew, isNew, parseSeen, seenValue } from "./since-last-visit.ts";

const ME = "abcdef12-0000-4000-8000-000000000001";
const NOW = new Date("2026-11-22T12:00:00Z");

test("쿠키: 내 값이면 그 시각, 없음 · 다른 사용자 · 깨진 값 · 미래 시각이면 null", () => {
  const at = new Date("2026-11-22T09:00:00Z");
  assert.equal(parseSeen(seenValue(ME, at), ME, NOW), at.getTime());
  assert.equal(parseSeen(encodeURIComponent(seenValue(ME, at)), ME, NOW), at.getTime()); // 주소 인코딩된 값도
  assert.equal(parseSeen(undefined, ME, NOW), null);
  assert.equal(parseSeen(seenValue("99999999-0000-4000-8000-000000000002", at), ME, NOW), null);
  for (const bad of ["abcdef12", "abcdef12|어제", "abcdef12|2026-11-22T09:00:00Z|x", "%E0%A4%A", "|2026-11-22T09:00:00Z"]) assert.equal(parseSeen(bad, ME, NOW), null, bad);
  assert.equal(parseSeen(seenValue(ME, new Date("2026-11-23T00:00:00Z")), ME, NOW), null);
});

test("새로 옴: 기준보다 늦은 것만(같은 시각은 아님), 기준이 없으면 아무것도 아님", () => {
  const seen = Date.parse("2026-11-22T09:00:00Z");
  assert.equal(isNew("2026-11-22T09:00:00Z", seen), false);
  assert.equal(isNew("2026-11-22T09:00:01Z", seen), true);
  assert.equal(isNew("2026-11-22T10:00:00Z", null), false);
});

test("새로 온 수: 판단 대기만, 보이는 5줄 밖의 것도 센다", () => {
  const seen = Date.parse("2026-11-22T09:00:00Z");
  const alerts = Array.from({ length: 7 }, (_, i) => ({ status: "pending", createdAt: `2026-11-22T1${i}:00:00Z` }));
  alerts.push({ status: "done", createdAt: "2026-11-22T11:30:00Z" }, { status: "pending", createdAt: "2026-11-22T08:00:00Z" });
  assert.equal(countNew(alerts, seen), 7);
  assert.equal(countNew(alerts, null), 0);
});
