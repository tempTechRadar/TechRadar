import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBatch, type Collector } from "./run-batch.ts";

type Call = { table: string; op: "insert" | "update"; row: Record<string, unknown>; eq?: [string, unknown] };

// 실제 DB 대신 "무엇을 어디에 쓰려 했는지"만 모으는 가짜 클라이언트
function fakeDb(opts: { failRunsUpdate?: boolean } = {}) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, op: "insert", row });
          const done = Promise.resolve({ data: { id: "run-1" }, error: null });
          return Object.assign(done, { select: () => ({ single: () => done }) });
        },
        update(row: Record<string, unknown>) {
          const call: Call = { table, op: "update", row };
          calls.push(call);
          const error = opts.failRunsUpdate && "next_retry_at" in row ? { message: "쓰기 거부" } : null;
          return { eq: (c: string, v: unknown) => ((call.eq = [c, v]), Promise.resolve({ data: null, error })) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const ok = (source: string, items = 1): Collector => ({ source, run: async () => ({ items, summary: `${items}건` }) });
const bad = (source: string, kind?: string): Collector => ({
  source,
  run: async () => { throw Object.assign(new Error(`${source} 응답 없음`), kind ? { kind } : {}); },
});
const steps = (calls: Call[]) => calls.filter((c) => c.table === "run_steps").map((c) => `${c.row.step_name}:${c.row.status}`);
const finish = (calls: Call[]) => calls.filter((c) => c.table === "runs" && c.op === "update" && "status" in c.row).at(-1)!.row;
const T0 = Date.parse("2026-11-18T21:00:00Z");

test("등록된 수집기가 없으면 실행 기록을 만들지 않고 이유만 돌려준다(가짜로 칠하지 않음)", async () => {
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [] }, { trigger: "manual" });
  assert.equal(r.started, false);
  assert.equal(calls.length, 0);
});

test("모두 성공: schedule로 시작, 출처마다 성공 줄, 처리 건수 합, 재시도 없음", async () => {
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [ok("fetch_osv", 3), ok("fetch_registry", 5)], now: () => T0 }, { trigger: "schedule" });
  assert.equal(calls[0].row.trigger, "schedule");
  assert.deepEqual(steps(calls), ["fetch_osv:succeeded", "fetch_registry:succeeded"]);
  assert.ok(r.started && r.status === "succeeded" && r.items === 8 && r.retry === null);
  assert.deepEqual([finish(calls).status, finish(calls).item_count], ["succeeded", 8]);
  assert.equal(calls.some((c) => "next_retry_at" in c.row), false);
});

test("출처 하나가 실패해도 나머지는 계속하고, 실패는 수집 오류로 남긴다('변화 없음'으로 쓰지 않음, 불변 2)", async () => {
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [bad("fetch_osv", "http_status"), ok("fetch_registry", 2)], now: () => T0 }, { trigger: "manual", startedBy: "admin-1" });
  assert.deepEqual(steps(calls), ["fetch_osv:failed", "collect_error:succeeded", "fetch_registry:succeeded"]);
  const failed = calls.find((c) => c.row.step_name === "fetch_osv")!.row;
  assert.equal(failed.error_kind, "http_status");
  assert.match(String(failed.error_message), /응답 없음/);
  assert.equal(steps(calls).some((s) => s.startsWith("no_change")), false);
  assert.ok(r.started && r.status === "partial");
  assert.deepEqual(r.started && [r.succeeded, r.failed], [["fetch_registry"], ["fetch_osv"]]);
  assert.equal(calls[0].row.started_by, "admin-1");
});

test("실패가 있으면 2분 뒤 다음 시도를 실행 줄에 적는다(attempt·next_retry_at)", async () => {
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [bad("fetch_osv")], now: () => T0 }, { trigger: "schedule" });
  const retry = calls.find((c) => "next_retry_at" in c.row)!;
  assert.deepEqual(retry.row, { attempt: 1, next_retry_at: "2026-11-18T21:02:00.000Z" });
  assert.deepEqual(retry.eq, ["id", "run-1"]);
  assert.ok(r.started && r.status === "failed");
  assert.deepEqual(r.started && r.retry, { attempt: 2, at: "2026-11-18T21:02:00.000Z" });
});

test("3번째 시도도 실패하면 더 재시도하지 않는다(next_retry_at 비움)", async () => {
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [bad("fetch_osv")], now: () => T0 }, { trigger: "manual", attempt: 3 });
  assert.deepEqual(calls.find((c) => "next_retry_at" in c.row)!.row, { attempt: 3, next_retry_at: null });
  assert.ok(r.started && r.retry === null);
});

test("시간 한도를 넘기면 남은 출처는 시작하지 않고(기록 없음) 실행은 일부 실패로 닫는다", async () => {
  let t = T0;
  const slow: Collector = { source: "fetch_osv", run: async () => { t += 5_000; return { items: 1 }; } };
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [slow, ok("fetch_registry"), ok("fetch_github")], now: () => t, budgetMs: 4_000 }, { trigger: "schedule" });
  assert.deepEqual(steps(calls), ["fetch_osv:succeeded"]);
  assert.ok(r.started && r.status === "partial");
  assert.deepEqual(r.started && r.skipped, ["fetch_registry", "fetch_github"]);
});

test("수집기가 이름 붙은 시간 초과(TimeoutError)를 던지면 오류 종류는 timeout", async () => {
  const { db, calls } = fakeDb();
  const timeout: Collector = { source: "fetch_github", run: async () => { const e = new Error("느림"); e.name = "TimeoutError"; throw e; } };
  await runBatch({ db, collectors: [timeout], now: () => T0 }, { trigger: "manual" });
  assert.equal(calls.find((c) => c.row.step_name === "fetch_github")!.row.error_kind, "timeout");
});

test("기록 쓰기 자체가 실패하면 실행을 failed로 닫고 원래 오류를 던진다", async () => {
  const { db, calls } = fakeDb({ failRunsUpdate: true });
  await assert.rejects(() => runBatch({ db, collectors: [bad("fetch_osv")], now: () => T0 }, { trigger: "manual" }), /재시도 시각을 적지 못함/);
  assert.equal(finish(calls).status, "failed");
});

test("수집기가 비밀값이 든 오류를 던져도 기록에는 가려서 남는다(SPEC-8)", async () => {
  const { db, calls } = fakeDb();
  const fake = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";
  await runBatch({ db, collectors: [{ source: "fetch_github", run: async () => { throw new Error(`401 token ${fake}`); } }], now: () => T0 }, { trigger: "manual" });
  assert.equal(JSON.stringify(calls).includes(fake), false);
});
