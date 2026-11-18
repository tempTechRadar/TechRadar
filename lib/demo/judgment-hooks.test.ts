import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveJudgment } from "../server/judgments.ts";
import { DEMO_SAVE_FAILURE, failingRpc, maybeFailForDemo } from "./judgment-hooks.ts";

type Row = Record<string, unknown>;

// 알림 읽기와 rpc 호출만 모으는 가짜 클라이언트(judgments.test.ts와 같은 모양)
function fakeDb(rows: Row[]) {
  const rpcCalls: string[] = [];
  const db = {
    from() {
      return {
        select() {
          let result = rows;
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            maybeSingle: () => Promise.resolve({ data: result[0] ?? null, error: null }),
          };
          return q;
        },
      };
    },
    rpc(name: string) {
      rpcCalls.push(name);
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
  return { db, rpcCalls };
}

const alertRow: Row = {
  id: "alert-1", user_id: "demo-a", kind: "security", status: "pending", created_at: "2026-11-18T01:30:00Z",
  changes: { kind: "grade_to_danger", detected_at: null, prev_value: null, curr_value: { fixed_version: "0.1.16" }, technologies: { display_name: "mcp-remote" } },
  my_technologies: null,
};
const on = { ENABLE_FAIL_DEMO: "true" };

test("시연 조건이 맞으면 판단 저장이 실제 실패 처리를 탄다(저장 안 함, 판단 대기 안내)", async () => {
  const { db, rpcCalls } = fakeDb([alertRow]);
  const picked = maybeFailForDemo({ db, env: on, isDemo: true, cookie: "1" });
  assert.equal(picked.consumed, true);
  const result = await saveJudgment(picked.db, { id: "demo-a", role: "user" }, { alertId: "alert-1", decision: "candidate", reason: "" });
  assert.deepEqual(result, { ok: false, message: "저장하지 못했어요. 다시 시도해 주세요. 알림은 아직 판단 대기예요." });
  assert.deepEqual(rpcCalls, []); // 진짜 save_judgment는 부르지 않았다
});

test("조건이 하나라도 아니면 원래 클라이언트 그대로(진짜 저장)", async () => {
  for (const ctx of [{ env: on, isDemo: false, cookie: "1" }, { env: on, isDemo: true, cookie: undefined }, { env: { VERCEL_ENV: "production", ENABLE_FAIL_DEMO: "true" }, isDemo: true, cookie: "1" }]) {
    const { db, rpcCalls } = fakeDb([alertRow]);
    const picked = maybeFailForDemo({ db, ...ctx });
    assert.equal(picked.consumed, false);
    assert.equal(picked.db, db);
    const result = await saveJudgment(picked.db, { id: "demo-a", role: "user" }, { alertId: "alert-1", decision: "candidate", reason: "" });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(rpcCalls, ["save_judgment"]);
  }
});

test("failingRpc: rpc만 오류, 읽기는 원래대로", async () => {
  const { db } = fakeDb([alertRow]);
  const f = failingRpc(db);
  assert.deepEqual(await f.rpc("save_judgment"), { data: null, error: { message: DEMO_SAVE_FAILURE } });
  assert.equal(f.from, db.from);
});
