import { test } from "node:test";
import assert from "node:assert/strict";
import { filterAlerts, type AlertRow } from "../alerts/filter-alerts.ts";
import { parseAlertFilter } from "../alerts/parse-alert-filter.ts";
import { changeCount } from "./change-count.ts";

const now = new Date("2026-11-23T03:00:00Z");
const row = (id: string, kind: string, status: string, daysAgo: number) => ({ id, kind, status, projectId: "p1", createdAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString() }) as unknown as AlertRow;
const alerts = [row("a", "security", "pending", 0.5), row("b", "opportunity", "done", 3), row("c", "model_eol", "pending", 20), row("d", "security", "done", 40)];

test("바뀐 것 n = 누르면 가는 알림 목록(같은 기간 거르기)의 행 수, 모든 종류", () => {
  for (const period of ["", "1d", "7d", "30d"]) {
    const c = changeCount(alerts, period, now);
    const listed = filterAlerts(alerts, parseAlertFilter(Object.fromEntries(new URL(c.href, "http://x").searchParams), now)).length;
    assert.equal(c.n, listed, `기간 ${period || "전체"}`);
  }
  assert.deepEqual([changeCount(alerts, "", now).n, changeCount(alerts, "1d", now).n, changeCount(alerts, "7d", now).n, changeCount(alerts, "30d", now).n], [4, 1, 2, 3]);
  assert.equal(changeCount(alerts, "7d", now).href, "/alerts?period=7d");
});

test("바뀐 것: 못 읽음(null)은 0이 아니라 null, 비었으면 0", () => {
  assert.equal(changeCount(null, "7d", now).n, null);
  assert.equal(changeCount([], "7d", now).n, 0);
});
