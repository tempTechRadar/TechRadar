import { test } from "node:test";
import assert from "node:assert/strict";
import { filterHistory, parseHistoryFilter, type HistoryItem } from "./filter-history.ts";

function item(id: string, overrides: Partial<HistoryItem> = {}): HistoryItem {
  return { id, techName: "mcp-remote", kind: "security", decision: "hold", judgedAt: "2026-11-18T00:00:00Z", ...overrides };
}

const items: HistoryItem[] = [
  item("h1", { techName: "mcp-remote", decision: "candidate", judgedAt: "2026-11-18T00:00:00Z" }),
  item("h2", { techName: "Next.js", kind: "opportunity", decision: "hold", judgedAt: "2026-11-10T00:00:00Z" }),
  item("h3", { techName: "next-auth", decision: "hold", judgedAt: "2026-10-01T00:00:00Z" }),
];
const ids = (rows: HistoryItem[]) => rows.map((r) => r.id);

test("기술 이름은 앞뒤 공백과 대소문자를 무시하고 일부만 맞아도 찾는다", () => {
  assert.deepEqual(ids(filterHistory(items, { query: "  NEXT " })), ["h2", "h3"]);
  assert.deepEqual(ids(filterHistory(items, {})), ["h1", "h2", "h3"]);
});

test("종류·판단 결과·기간(판단한 날, 이 시각 이상)은 모두 만족하는 것만", () => {
  assert.deepEqual(ids(filterHistory(items, { kind: "security", decision: "hold" })), ["h3"]);
  assert.deepEqual(ids(filterHistory(items, { from: "2026-11-11T00:00:00Z" })), ["h1"]);
  assert.deepEqual(ids(filterHistory(items, { query: "next", decision: "hold", from: "2026-11-01T00:00:00Z" })), ["h2"]);
});

test("주소의 값을 거르기 조건으로 바꾸고, 모르는 값과 빈 검색어는 걸지 않는다", () => {
  const now = new Date("2026-11-18T03:00:00Z");

  assert.deepEqual(parseHistoryFilter({ q: " next ", kind: "security", decision: "hold", period: "7d" }, now), {
    query: "next",
    kind: "security",
    decision: "hold",
    from: "2026-11-11T03:00:00.000Z",
  });
  assert.deepEqual(parseHistoryFilter({ q: "   ", decision: "아무거나", kind: ["a"] }, now), {});
});
