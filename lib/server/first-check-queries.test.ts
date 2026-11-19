import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readRecentFirstReads } from "./first-check-queries.ts";

type Answer = { data: unknown; error: { message: string } | null };
type Call = { table: string; select?: string; filters: [string, unknown][]; order?: [string, boolean]; limit?: number; inLists: [string, unknown[]][] };

// 읽기 전용 가짜 DB: 표마다 정해 둔 답을 주고, 어떤 조건으로 물었는지 남긴다
function fakeDb(answers: Record<string, Answer>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, filters: [], inLists: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        select: (columns: string) => ((call.select = columns), builder),
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
        in: (column: string, values: unknown[]) => (call.inLists.push([column, values]), builder),
        order: (column: string, opts: { ascending: boolean }) => ((call.order = [column, opts.ascending]), builder),
        limit: (n: number) => ((call.limit = n), builder),
        then: (resolve: (a: Answer) => unknown) => resolve(answers[table]),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const ok = (data: unknown): Answer => ({ data, error: null });

test("본인의 최근 first_read 실행들과 실행마다 grade·is_event 단계 건수·상태를 읽는다", async () => {
  const { db, calls } = fakeDb({
    runs: ok([{ id: "run-9", status: "succeeded" }, { id: "run-8", status: "partial" }]),
    run_steps: ok([
      { run_id: "run-9", step_name: "grade", branch_counts: { danger: 1, caution: 2 } },
      { run_id: "run-8", step_name: "grade", branch_counts: { caution: 4 } },
      { run_id: "run-9", step_name: "is_event", branch_counts: { collect_error: 1 } },
    ]),
  });
  const runs = await readRecentFirstReads(db, "user-1");
  assert.deepEqual(runs, [
    { id: "run-9", status: "succeeded", steps: [{ stepName: "grade", branchCounts: { danger: 1, caution: 2 } }, { stepName: "is_event", branchCounts: { collect_error: 1 } }] },
    { id: "run-8", status: "partial", steps: [{ stepName: "grade", branchCounts: { caution: 4 } }] },
  ]);
  const [r, s] = calls;
  assert.equal(r.select, "id, status");
  assert.deepEqual(r.filters, [["trigger", "first_read"], ["started_by", "user-1"]]);
  assert.deepEqual(r.order, ["started_at", false]);
  assert.equal(r.limit, 5);
  assert.deepEqual(s.inLists, [["run_id", ["run-9", "run-8"]], ["step_name", ["grade", "is_event"]]]);
});

test("첫 읽기 실행이 없으면 빈 목록이고 단계는 읽지 않는다", async () => {
  const { db, calls } = fakeDb({ runs: ok([]) });
  assert.deepEqual(await readRecentFirstReads(db, "user-1"), []);
  assert.equal(calls.length, 1);
});

test("단계가 하나도 없는 실행도 목록에 남는다(steps 빈 목록)", async () => {
  const { db } = fakeDb({ runs: ok([{ id: "r", status: "failed" }]), run_steps: ok([]) });
  assert.deepEqual(await readRecentFirstReads(db, "u"), [{ id: "r", status: "failed", steps: [] }]);
});

test("실행 조회가 실패하면 던진다(없는 것처럼 숨기지 않기)", async () => {
  const { db } = fakeDb({ runs: { data: null, error: { message: "boom" } } });
  await assert.rejects(readRecentFirstReads(db, "user-1"), /첫 읽기 실행을 읽지 못함: boom/);
});

test("단계 조회가 실패해도 던진다", async () => {
  const { db } = fakeDb({ runs: ok([{ id: "run-9", status: "succeeded" }]), run_steps: { data: null, error: { message: "nope" } } });
  await assert.rejects(readRecentFirstReads(db, "user-1"), /첫 읽기 단계를 읽지 못함: nope/);
});

test("건수 칸이 비어 있으면 branchCounts는 null", async () => {
  const { db } = fakeDb({ runs: ok([{ id: "r", status: "succeeded" }]), run_steps: ok([{ run_id: "r", step_name: "grade", branch_counts: null }]) });
  assert.deepEqual((await readRecentFirstReads(db, "u"))[0].steps, [{ stepName: "grade", branchCounts: null }]);
});
