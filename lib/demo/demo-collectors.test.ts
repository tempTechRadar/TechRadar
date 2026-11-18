import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runBatch } from "../schedule/run-batch.ts";
import { DemoCollectError, OSV_QUERY_URL, OSV_WRONG_URL, SAME_METRIC, askOsv, brokenOsvCollector, resetGapForTest, sameValueCollector, type DemoDeps } from "./demo-collectors.ts";

type Call = { table: string; op: string; row?: Record<string, unknown>; filters: [string, unknown][] };

// 무엇을 어디에 쓰고 읽었는지 모으는 가짜 클라이언트. respond로 읽기 결과를 정한다.
function fakeDb(respond: (c: Call) => { data?: unknown; error?: { message: string } } | undefined = () => undefined) {
  const calls: Call[] = [];
  const defaults: Record<string, unknown> = { "runs:insert": { id: "run-1" }, "sources:upsert": { id: "src-1" }, "technologies:upsert": [{ id: "tech-1" }] };
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {};
      const mark = (op: string) => (row?: Record<string, unknown>) => { call.op = op; if (row) call.row = row; return b; };
      b.insert = mark("insert"); b.upsert = mark("upsert"); b.update = mark("update");
      b.select = () => b; b.order = () => b; b.limit = () => b; b.single = () => b; b.maybeSingle = () => b;
      b.eq = (c: string, v: unknown) => (call.filters.push([c, v]), b);
      b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
        calls.push(call);
        const r = respond(call);
        return Promise.resolve({ data: r && "data" in r ? r.data : defaults[`${table}:${call.op}`] ?? null, error: r?.error ?? null }).then(res, rej);
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noWait: DemoDeps = { now: () => 0, sleep: async () => {} };
const steps = (calls: Call[]) => calls.filter((c) => c.table === "run_steps").map((c) => `${c.row?.step_name}:${c.row?.status}`);

test("askOsv: 실패를 오류 종류로 나눈다(404·500=상태 코드, 429=요청 한도, 연결 실패=네트워크, 이상한 응답=읽기 실패)", async () => {
  const pkg = { name: "mcp-remote", version: "0.1.16" };
  const cases: [() => Promise<Response>, string][] = [
    [async () => json(404, {}), "http_status"],
    [async () => json(500, {}), "http_status"],
    [async () => json(429, {}), "rate_limited"],
    [async () => { throw new TypeError("fetch failed"); }, "network"],
    [async () => new Response("<html>", { status: 200 }), "parse"],
  ];
  for (const [f, kind] of cases) {
    resetGapForTest();
    await assert.rejects(() => askOsv(OSV_QUERY_URL, pkg, { ...noWait, fetchImpl: f }), (e: unknown) => e instanceof DemoCollectError && e.kind === kind);
  }
});

test("askOsv: 같은 출처 요청 간격 1초를 지킨다", async () => {
  resetGapForTest();
  let t = 10_000;
  const waits: number[] = [];
  const deps: DemoDeps = { now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; }, fetchImpl: async () => json(200, { vulns: [] }) };
  await askOsv(OSV_QUERY_URL, { name: "a", version: "1" }, deps);
  t += 300;
  await askOsv(OSV_QUERY_URL, { name: "a", version: "1" }, deps);
  assert.deepEqual(waits, [700]);
});

test("① 수집 오류: 틀린 주소 수집기로 지금 실행하면 fetch_osv 실패·수집 오류가 실제로 기록되고 실행은 실패로 닫힌다", async () => {
  resetGapForTest();
  const urls: string[] = [];
  const { db, calls } = fakeDb();
  const r = await runBatch({ db, collectors: [brokenOsvCollector({ ...noWait, fetchImpl: async (u) => (urls.push(u), json(404, {})) })] }, { trigger: "manual", startedBy: "admin-1" });
  assert.equal(r.started, true);
  assert.deepEqual(urls, [OSV_WRONG_URL]);
  assert.deepEqual(steps(calls), ["fetch_osv:failed", "collect_error:succeeded"]);
  assert.equal(calls.find((c) => c.table === "run_steps" && c.row?.step_name === "fetch_osv")?.row?.error_kind, "http_status");
  assert.equal(calls.filter((c) => c.table === "runs" && c.op === "update").at(-1)?.row?.status, "failed");
});

test("② 사건 아님: 처음은 '비교할 이전 값 없음', 같은 값이면 변화 없음 갈래만 늘고 변경·알림은 없다", async () => {
  const vulnFree = async () => json(200, { vulns: [] });
  // 취약점 0건이면 등급은 "unknown"(저장소 정보 확인 전에는 통과를 주지 않음, SPEC-1). 같은 값이면 사건 아님
  for (const [prev, expectNoChange] of [[null, 0], [{ curr_value: { grade: "unknown" } }, 1]] as const) {
    resetGapForTest();
    const { db, calls } = fakeDb((c) => (c.table === "observations" && c.op === "select" ? { data: prev } : undefined));
    await runBatch({ db, collectors: [sameValueCollector(db, { ...noWait, fetchImpl: vulnFree })] }, { trigger: "manual" });
    const isEvent = calls.find((c) => c.table === "run_steps" && c.row?.step_name === "is_event")?.row;
    assert.deepEqual(isEvent?.branch_counts, { event: 0, no_change: expectNoChange, collect_error: 0 });
    const obs = calls.find((c) => c.table === "observations" && c.op === "insert")?.row;
    assert.equal(obs?.is_simulated, true);
    assert.equal(obs?.metric, SAME_METRIC);
    assert.equal(calls.some((c) => ["changes", "alerts"].includes(c.table)), false);
    const names = steps(calls);
    assert.equal(names.includes("no_change:succeeded"), expectNoChange === 1);
    if (prev === null) assert.match(String(calls.find((c) => c.row?.step_name === "compare")?.row?.output_summary), /비교할 이전 값이 없음/);
  }
});

test("② 사건 아님: 이전 값을 가짜 표시 줄에서만 찾는다", async () => {
  resetGapForTest();
  const { db, calls } = fakeDb();
  await runBatch({ db, collectors: [sameValueCollector(db, { ...noWait, fetchImpl: async () => json(200, { vulns: [] }) })] }, { trigger: "manual" });
  const read = calls.find((c) => c.table === "observations" && c.op === "select");
  assert.ok(read?.filters.some(([c, v]) => c === "is_simulated" && v === true));
  assert.ok(read?.filters.some(([c, v]) => c === "metric" && v === SAME_METRIC));
});
