import { test } from "node:test";
import assert from "node:assert/strict";
import { countBy, latest, newestFirst, periodStart, pickId, pickOne, withinPeriod } from "./admin-filter.ts";

const NOW = new Date("2026-11-18T12:00:00Z");

test("periodStart: 7d·30d만 받고 모르는 값·배열·없음은 전체 기간(null)", () => {
  assert.equal(periodStart("7d", NOW), "2026-11-11T12:00:00.000Z");
  assert.equal(periodStart("30d", NOW), "2026-10-19T12:00:00.000Z");
  for (const bad of [undefined, "", "1y", ["7d"], "toString"]) assert.equal(periodStart(bad as never, NOW), null);
});

test("pickOne: 허용 목록 밖 값은 null", () => {
  assert.equal(pickOne("pending", ["pending", "done"] as const), "pending");
  assert.equal(pickOne("deleted", ["pending", "done"] as const), null);
  assert.equal(pickOne(["pending"], ["pending", "done"] as const), null);
});

test("pickId: uuid 모양만 받고 소문자로", () => {
  assert.equal(pickId("0F8FAD5B-D9CB-469F-A165-70867728950E"), "0f8fad5b-d9cb-469f-a165-70867728950e");
  for (const bad of ["1", "x' or 1=1", "0f8fad5b-d9cb-469f-a165-70867728950e,abc", undefined]) assert.equal(pickId(bad), null);
});

test("withinPeriod: DB 시각 형식(+00:00, 마이크로초)도 숫자로 비교한다", () => {
  const from = "2026-11-11T12:00:00.000Z";
  assert.equal(withinPeriod("2026-11-11T12:00:00.000001+00:00", from), true);
  assert.equal(withinPeriod("2026-11-11T11:59:59+00:00", from), false);
  assert.equal(withinPeriod(null, from), false);
  assert.equal(withinPeriod("엉뚱한 값", from), false);
  assert.equal(withinPeriod(null, null), true);
});

test("newestFirst: 최신순, 시각 없는 줄은 맨 뒤, 원래 배열은 그대로", () => {
  const rows = [{ t: "2026-11-01T00:00:00+00:00" }, { t: null }, { t: "2026-11-18T00:00:00Z" }, { t: null }];
  const sorted = newestFirst(rows, (r) => r.t);
  assert.deepEqual(sorted.map((r) => r.t), ["2026-11-18T00:00:00Z", "2026-11-01T00:00:00+00:00", null, null]);
  assert.equal(rows[0].t, "2026-11-01T00:00:00+00:00");
});

test("countBy·latest", () => {
  assert.deepEqual(countBy([{ k: "a" }, { k: "b" }, { k: "a" }, { k: null }], (r) => r.k), { a: 2, b: 1, "(없음)": 1 });
  assert.equal(latest([null, "2026-11-01T00:00:00Z", "2026-11-02T00:00:00+00:00", undefined]), "2026-11-02T00:00:00+00:00");
  assert.equal(latest([null, undefined]), null);
});
