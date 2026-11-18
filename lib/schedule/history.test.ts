import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSourceHistory, toSourceResults } from "./history.ts";

const runs = [{ id: "r1", created_at: "2026-11-17T21:00:00Z" }, { id: "r2", created_at: "2026-11-18T21:00:00Z" }];

test("수집 상자 줄만 출처 결과로 바꾸고, 같은 실행에 실패 줄이 하나라도 있으면 실패", () => {
  const steps = [
    { run_id: "r1", step_name: "fetch_osv", status: "succeeded" },
    { run_id: "r2", step_name: "fetch_osv", status: "succeeded" },
    { run_id: "r2", step_name: "fetch_osv", status: "failed" },
    { run_id: "r2", step_name: "normalize", status: "failed" },
    { run_id: "zz", step_name: "fetch_osv", status: "failed" },
  ];
  assert.deepEqual(toSourceResults(runs, steps, ["fetch_osv"]), [
    { source: "fetch_osv", at: "2026-11-17T21:00:00Z", failed: false },
    { source: "fetch_osv", at: "2026-11-18T21:00:00Z", failed: true },
  ]);
});

test("출처가 없으면 DB를 부르지 않는다", async () => {
  let called = false;
  const db = { from: () => { called = true; return {}; } } as unknown as SupabaseClient;
  assert.deepEqual(await readSourceHistory(db, []), []);
  assert.equal(called, false);
});

test("정기·지금 실행만 읽고, 조회 실패는 '없음'이 아니라 오류로 던진다", async () => {
  const filters: unknown[] = [];
  const chain = (data: unknown, error: { message: string } | null = null) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit"]) q[m] = () => q;
    q.in = (c: string, v: unknown) => (filters.push([c, v]), q);
    q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(res);
    return q;
  };
  const db = { from: (t: string) => (t === "runs" ? chain(null, { message: "권한 없음" }) : chain([])) } as unknown as SupabaseClient;
  await assert.rejects(() => readSourceHistory(db, ["fetch_osv"]), /실행 기록을 읽지 못함: 권한 없음/);
  assert.deepEqual(filters[0], ["trigger", ["schedule", "manual"]]);
});
