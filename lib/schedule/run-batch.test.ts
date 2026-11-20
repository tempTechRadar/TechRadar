import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBatch, type Collector } from "./run-batch.ts";

type Call = { table: string; op: "insert" | "update"; row: Record<string, unknown>; eq?: [string, unknown] };

// 실제 DB 대신 "무엇을 어디에 쓰려 했는지"만 모으는 가짜 클라이언트
type Running = { id: string; trigger: string; started_at: string };
type Filter = [string, string, unknown];

function fakeDb(opts: { failRunsUpdate?: boolean; running?: Running[]; failRunningRead?: boolean } = {}) {
  const calls: Call[] = [];
  const reads: { table: string; filters: Filter[] }[] = [];
  const db = {
    from(table: string) {
      return {
        // 겹침 확인(도는 실행 찾기): 거름 조건을 모아 두고, 조건에 맞는 줄만 돌려준다
        select() {
          const filters: Filter[] = [];
          reads.push({ table, filters });
          const rows = () => (opts.running ?? []).filter((r) => filters.every(([op, col, v]) => {
            const have = (r as Record<string, unknown>)[col] ?? (col === "status" ? "running" : undefined);
            if (op === "in") return (v as unknown[]).includes(have);
            return op === "gte" ? String(have) >= String(v) : have === v;
          }));
          const chain = {
            in: (c: string, v: unknown) => (filters.push(["in", c, v]), chain),
            eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), chain),
            gte: (c: string, v: unknown) => (filters.push(["gte", c, v]), chain),
            order: () => chain,
            limit: () => Promise.resolve(opts.failRunningRead ? { data: null, error: { message: "읽기 거부" } } : { data: rows(), error: null }),
          };
          return chain;
        },
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
  return { db, calls, reads };
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

// 겹쳐 도는 실행 막기(I-run-batch-overlap): 정기 실행과 "지금 한 번 실행"이 같은 수집기를 동시에 돌리면 같은 자료를 두 번 읽고 쓴다
const minAgo = (m: number) => new Date(T0 - m * 60_000).toISOString();

test("정기·지금 실행이 이미 돌고 있으면 새 실행을 시작하지 않고 이유를 돌려준다(실행 기록·수집 없음)", async () => {
  for (const trigger of ["schedule", "manual"]) {
    const { db, calls } = fakeDb({ running: [{ id: "run-0", trigger, started_at: minAgo(5) }] });
    let ran = false;
    const r = await runBatch({ db, collectors: [{ source: "fetch_osv", run: async () => ((ran = true), { items: 1 }) }], now: () => T0 }, { trigger: "manual" });
    assert.equal(r.started, false);
    assert.match(r.started ? "" : r.reason, /이미 돌고 있어요.*최대 6분/);
    assert.equal(ran, false);
    assert.equal(calls.length, 0);
  }
});

test("겹침 확인은 정기·지금 실행 가운데 최근 6분 안에 시작해 아직 도는 것만 본다", async () => {
  const { db, reads } = fakeDb();
  await runBatch({ db, collectors: [ok("fetch_osv")], now: () => T0 }, { trigger: "schedule" });
  assert.equal(reads.length, 1);
  assert.equal(reads[0].table, "runs");
  assert.deepEqual([...reads[0].filters].sort((a, b) => a[1].localeCompare(b[1])), [
    ["gte", "started_at", minAgo(6)],
    ["eq", "status", "running"],
    ["in", "trigger", ["schedule", "manual"]],
  ]);
});

test("6분 넘게 '도는 중'인 줄은 멈춘 실행으로 보고 막지 않는다(함수 한도 300초 + 여유)", async () => {
  const { db } = fakeDb({ running: [{ id: "run-0", trigger: "schedule", started_at: minAgo(7) }] });
  const r = await runBatch({ db, collectors: [ok("fetch_osv")], now: () => T0 }, { trigger: "manual" });
  assert.equal(r.started, true);
});

test("시뮬레이터·읽기·채점 실행이 도는 중이어도 수집 묶음은 막지 않는다", async () => {
  for (const trigger of ["simulator", "first_read", "user_reread", "scoring"]) {
    const { db } = fakeDb({ running: [{ id: "run-0", trigger, started_at: minAgo(1) }] });
    const r = await runBatch({ db, collectors: [ok("fetch_osv")], now: () => T0 }, { trigger: "schedule" });
    assert.equal(r.started, true, trigger);
  }
});

test("겹침 확인을 읽지 못하면 수집을 멈추지 않고 그대로 실행한다(확인은 보조 장치)", async () => {
  const { db, calls } = fakeDb({ failRunningRead: true });
  const errors: unknown[][] = [];
  const realError = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); };
  try {
    const r = await runBatch({ db, collectors: [ok("fetch_osv")], now: () => T0 }, { trigger: "schedule" });
    assert.equal(r.started, true);
    assert.deepEqual(steps(calls), ["fetch_osv:succeeded"]);
    assert.match(String(errors[0]?.[0]), /겹침 확인/);
  } finally {
    console.error = realError;
  }
});
