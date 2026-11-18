import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isUserRun, runLine, took } from "./run-list.ts";
import type { Flow, RunListRow } from "./types.ts";

const flow = JSON.parse(readFileSync("flow/flow.json", "utf8")) as Flow;
const run = (extra: Partial<RunListRow> = {}): RunListRow => ({
  id: "r1", trigger: "simulator", status: "succeeded", created_at: "2026-11-18T01:00:00Z",
  started_at: "2026-11-18T01:00:00Z", finished_at: "2026-11-18T01:00:12Z", item_count: 1, ...extra,
});

test("실행 한 줄: 한국 시각·시작 상자 이름·결과·걸린 시간·처리 건수", () => {
  const line = runLine(flow, run());
  assert.equal(line.when, new Date("2026-11-18T01:00:00Z").toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }));
  assert.equal(line.start, flow.nodes.find((n) => n.id === "start_simulator")!.name);
  assert.equal(line.status, "성공");
  assert.equal(line.took, "12초");
  assert.equal(line.items, "1건");
});

test("걸린 시간: 안 끝났으면 '진행 중', 시작 시각이 없으면 '기록 없음'(짐작하지 않음)", () => {
  assert.equal(took({ started_at: "2026-11-18T01:00:00Z", finished_at: null }), "진행 중");
  assert.equal(took({ started_at: null, finished_at: null }), "기록 없음");
  assert.equal(took({ started_at: "2026-11-18T01:00:10Z", finished_at: "2026-11-18T01:00:00Z" }), "기록 없음");
});

test("일부 실패·모르는 시작 방식도 그대로 보인다", () => {
  assert.equal(runLine(flow, run({ status: "partial" })).status, "일부 실패");
  assert.equal(runLine(flow, run({ trigger: "unknown_x" })).start, "unknown_x");
});

test("내 실행 기록(IA-11): 본인이 시작한 처음 읽기·다시 읽기만", () => {
  assert.equal(isUserRun({ trigger: "first_read", started_by: "u1" }, "u1"), true);
  assert.equal(isUserRun({ trigger: "user_reread", started_by: "u1" }, "u1"), true);
  assert.equal(isUserRun({ trigger: "user_reread", started_by: "u2" }, "u1"), false);
  assert.equal(isUserRun({ trigger: "simulator", started_by: "u1" }, "u1"), false);
  assert.equal(isUserRun({ trigger: "first_read", started_by: null }, "u1"), false);
});
