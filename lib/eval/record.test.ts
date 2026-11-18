import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordScoring } from "./record.ts";
import type { Score } from "./score.ts";

type Call = { table: string; op: "insert" | "update"; row: Record<string, unknown> };

// 실제 DB 대신 "무엇을 어디에 쓰려 했는지"만 모으는 가짜 클라이언트. failStep이면 그 단계 쓰기에서 실패한다
function fakeDb(failStep?: string) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, op: "insert", row });
          const error = table === "run_steps" && row.step_name === failStep && row.status === "succeeded" ? { message: "쓰기 실패" } : null;
          const done = Promise.resolve({ data: { id: "run-1" }, error });
          return Object.assign(done, { select: () => ({ single: () => done }) });
        },
        update(row: Record<string, unknown>) {
          calls.push({ table, op: "update", row });
          return { eq: () => Promise.resolve({ data: null, error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const score: Score = { rows: [], totals: { cases: 12, hit: 6, quietOk: 6, miss: 0, falseAlarm: 0, gradeOk: 8, failed: 0 } };
const steps = (calls: Call[]) => calls.filter((c) => c.table === "run_steps").map((c) => `${c.row.step_name}:${c.row.status}`);

test("채점 실행: start_scoring → score → score_save 순서로, 흐름 상자 id와 같은 이름으로 남긴다", async () => {
  const { db, calls } = fakeDb();
  const runId = await recordScoring(db, score, { path: "eval/result.md", startedBy: "admin-1" });
  assert.equal(runId, "run-1");
  assert.equal(calls[0].row.trigger, "scoring");
  assert.equal(calls[0].row.started_by, "admin-1");
  assert.deepEqual(steps(calls), ["score:succeeded", "score_save:succeeded"]);
  const scoreRow = calls.find((c) => c.row.step_name === "score")!.row;
  assert.deepEqual(scoreRow.branch_counts, { hit: 6, quiet_ok: 6, miss: 0, false_alarm: 0 });
  assert.equal(scoreRow.count_in, 12);
  assert.equal(calls.at(-1)?.row.status, "succeeded");
  assert.equal(calls.at(-1)?.row.item_count, 12);
});

test("저장 단계가 실패하면 score_save를 failed로 남기고 실행도 failed로 닫은 뒤 원래 오류를 던진다", async () => {
  const { db, calls } = fakeDb("score_save");
  await assert.rejects(() => recordScoring(db, score, { path: "eval/result.md" }), /쓰기 실패/);
  assert.deepEqual(steps(calls), ["score:succeeded", "score_save:succeeded", "score_save:failed"]);
  assert.equal(calls.at(-1)?.table, "runs");
  assert.equal(calls.at(-1)?.row.status, "failed");
});
