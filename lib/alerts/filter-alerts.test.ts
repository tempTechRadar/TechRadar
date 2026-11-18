import { test } from "node:test";
import assert from "node:assert/strict";
import { countPending, filterAlerts, type AlertRow } from "./filter-alerts.ts";

function alert(id: string, overrides: Partial<AlertRow> = {}): AlertRow {
  return { id, kind: "security", status: "pending", createdAt: "2026-11-18T00:00:00Z", ...overrides };
}

const alerts: AlertRow[] = [
  alert("a1", { kind: "security", status: "pending" }),
  alert("a2", { kind: "security", status: "done" }),
  alert("a3", { kind: "opportunity", status: "pending" }),
  alert("a4", { kind: "opportunity", status: "done" }),
];

const ids = (rows: AlertRow[]) => rows.map((row) => row.id);

test("조건이 없으면 전부, 입력 순서 그대로", () => {
  assert.deepEqual(ids(filterAlerts(alerts, {})), ["a1", "a2", "a3", "a4"]);
});

test("종류로 거른다", () => {
  assert.deepEqual(ids(filterAlerts(alerts, { kind: "opportunity" })), ["a3", "a4"]);
});

test("상태로 거른다", () => {
  assert.deepEqual(ids(filterAlerts(alerts, { status: "done" })), ["a2", "a4"]);
});

// 기간 경계는 문서에 없어서 정한 것: from 이상, to 미만(하루씩 이어 붙여도 겹치지 않음).
test("기간으로 거른다: from 이상, to 미만", () => {
  const dated = [
    alert("d1", { createdAt: "2026-11-16T23:59:59Z" }),
    alert("d2", { createdAt: "2026-11-17T00:00:00Z" }),
    alert("d3", { createdAt: "2026-11-17T12:00:00Z" }),
    alert("d4", { createdAt: "2026-11-18T00:00:00Z" }),
  ];
  const period = { from: "2026-11-17T00:00:00Z", to: "2026-11-18T00:00:00Z" };

  assert.deepEqual(ids(filterAlerts(dated, period)), ["d2", "d3"]);
  assert.deepEqual(ids(filterAlerts(dated, { from: period.from })), ["d2", "d3", "d4"]);
  assert.deepEqual(ids(filterAlerts(dated, { to: period.to })), ["d1", "d2", "d3"]);
});

test("판단 대기 수는 종류와 상관없이 판단 대기인 알림 수이고, 없으면 0", () => {
  assert.equal(countPending(alerts), 2);
  assert.equal(countPending([alert("x", { status: "done" })]), 0);
  assert.equal(countPending([]), 0);
});

test("종류와 상태를 함께 주면 둘 다 맞는 것만", () => {
  assert.deepEqual(ids(filterAlerts(alerts, { kind: "security", status: "pending" })), ["a1"]);
});
