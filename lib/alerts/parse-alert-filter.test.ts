import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlertFilter } from "./parse-alert-filter.ts";

const now = new Date("2026-11-18T03:00:00Z");

test("주소의 값을 거르기 조건으로 바꾼다(기간은 지금부터 거꾸로 센다)", () => {
  assert.deepEqual(parseAlertFilter({ kind: "security", status: "pending", period: "7d" }, now), {
    kind: "security",
    status: "pending",
    from: "2026-11-11T03:00:00.000Z",
  });
  assert.deepEqual(parseAlertFilter({ period: "30d" }, now), { from: "2026-10-19T03:00:00.000Z" });
});

test("값이 없거나 모르는 값이면 그 조건은 걸지 않는다(전체)", () => {
  assert.deepEqual(parseAlertFilter({}, now), {});
  assert.deepEqual(parseAlertFilter({ kind: "아무거나", status: ["pending"], period: "all" }, now), {});
});
