import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { finishRun, recordStep, startRun } from "./run-log.ts";

type Call = { table: string; op: "insert" | "update"; row: Record<string, unknown>; eq?: [string, string] };
const FAKE_GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

// 실제 DB 대신 "무엇을 어디에 쓰려 했는지"만 모으는 가짜 클라이언트
function fakeDb(result: { data: unknown; error: { message: string } | null } = { data: { id: "run-1" }, error: null }) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, op: "insert", row });
          const done = Promise.resolve(result);
          return Object.assign(done, { select: () => ({ single: () => done }) });
        },
        update(row: Record<string, unknown>) {
          const call: Call = { table, op: "update", row };
          calls.push(call);
          return { eq: (col: string, val: string) => ((call.eq = [col, val]), Promise.resolve(result)) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

test("startRun: runs에 '실행 중'으로 한 줄 쓰고 id를 돌려준다", async () => {
  const { db, calls } = fakeDb();
  const id = await startRun(db, { trigger: "simulator", startedBy: "u1" });
  assert.equal(id, "run-1");
  assert.equal(calls[0].table, "runs");
  assert.equal(calls[0].row.trigger, "simulator");
  assert.equal(calls[0].row.status, "running");
  assert.equal(calls[0].row.started_by, "u1");
  assert.equal(calls[0].row.project_id, null);
});

test("startRun: DB가 실패하면 비밀값을 가린 오류로 던진다", async () => {
  const { db } = fakeDb({ data: null, error: { message: `연결 실패 ${FAKE_GH}` } });
  await assert.rejects(() => startRun(db, { trigger: "manual" }), (e: Error) => e.message.includes("***") && !e.message.includes(FAKE_GH));
});

test("recordStep: 요약·오류·호출 주소의 비밀값을 가리고 칸에 맞게 쓴다", async () => {
  const { db, calls } = fakeDb({ data: null, error: null });
  await recordStep(db, "run-1", {
    stepName: "fetch_github",
    status: "failed",
    inputSummary: `저장소 3개, GITHUB_TOKEN=${FAKE_GH}`,
    apiUrl: "https://api.github.com/repos/a/b?access_token=zzz999",
    httpStatus: 403,
    durationMs: 1200,
    countIn: 3,
    countOut: 0,
    branchCounts: { 사건: 0, "변화 없음": 0, "수집 오류": 3 },
    errorKind: "rate_limited",
    errorMessage: `한도 초과 Bearer ${FAKE_GH}`,
  });
  const row = calls[0].row;
  assert.equal(calls[0].table, "run_steps");
  assert.equal(row.run_id, "run-1");
  assert.equal(row.step_name, "fetch_github");
  assert.equal(row.input_summary, "저장소 3개, GITHUB_TOKEN=***");
  assert.equal(row.api_url, "https://api.github.com/repos/a/b?access_token=***");
  assert.equal(row.error_message, "한도 초과 Bearer ***");
  assert.equal(row.http_status, 403);
  assert.equal(row.count_in, 3);
  assert.deepEqual(row.branch_counts, { 사건: 0, "변화 없음": 0, "수집 오류": 3 });
  assert.equal(row.error_kind, "rate_limited");
  assert.ok(!JSON.stringify(row).includes(FAKE_GH));
});

test("recordStep: 끝난 단계(성공·실패)만 끝난 시각이 있고, 대기·진행·판단 대기는 비어 있다", async () => {
  const { db, calls } = fakeDb({ data: null, error: null });
  for (const status of ["succeeded", "failed", "running", "waiting", "awaiting_judgment"] as const) {
    await recordStep(db, "run-1", { stepName: "grade", status });
  }
  const finished = calls.map((c) => c.row.finished_at !== null);
  assert.deepEqual(finished, [true, true, false, false, false]);
  assert.equal(calls[0].row.input_summary, null);
});

test("recordStep: DB가 실패하면 어느 단계인지와 함께 오류를 던진다", async () => {
  const { db } = fakeDb({ data: null, error: { message: "permission denied" } });
  await assert.rejects(() => recordStep(db, "run-1", { stepName: "notify", status: "succeeded" }), /"notify".*permission denied/);
});

test("finishRun: 상태·끝난 시각·처리 건수를 그 실행 줄에만 쓴다", async () => {
  const { db, calls } = fakeDb({ data: null, error: null });
  await finishRun(db, "run-1", { status: "partial", itemCount: 12 });
  assert.equal(calls[0].op, "update");
  assert.equal(calls[0].table, "runs");
  assert.equal(calls[0].row.status, "partial");
  assert.equal(calls[0].row.item_count, 12);
  assert.ok(typeof calls[0].row.finished_at === "string");
  assert.deepEqual(calls[0].eq, ["id", "run-1"]);
});
