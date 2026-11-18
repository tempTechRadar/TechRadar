import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordActionOutcome } from "./action-record.ts";

type Insert = { table: string; row: Record<string, unknown> };

function fakeDb(alert: unknown, opts: { readError?: string; insertError?: string } = {}) {
  const inserts: Insert[] = [];
  const db = {
    from(table: string) {
      return {
        select() {
          const q = { eq: () => q, maybeSingle: () => Promise.resolve(opts.readError ? { data: null, error: { message: opts.readError } } : { data: alert, error: null }) };
          return q;
        },
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ data: null, error: opts.insertError ? { message: opts.insertError } : null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, inserts };
}

const alertWithRun = { id: "al-1", changes: { observation_id: "obs-1", observations: { run_id: "run-9" } } };

test("판단 저장 성공이면 그 알림이 생긴 실행에 action_record 성공 한 줄", async () => {
  const { db, inserts } = fakeDb(alertWithRun);
  assert.deepEqual(await recordActionOutcome(db, "al-1", { ok: true }), { recorded: true, runId: "run-9" });
  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "run_steps");
  assert.equal(inserts[0].row.run_id, "run-9");
  assert.equal(inserts[0].row.step_name, "action_record");
  assert.equal(inserts[0].row.status, "succeeded");
});

test("알림 줄에 run_id가 있으면 그 실행에 적는다(변경 → 수집 자료 경로가 다른 실행을 가리켜도: 공유 변경에서 남의 실행에 쓰지 않음)", async () => {
  const { db, inserts } = fakeDb({ id: "al-1", run_id: "run-mine", changes: { observation_id: "obs-1", observations: { run_id: "run-someone-else" } } });
  assert.deepEqual(await recordActionOutcome(db, "al-1", { ok: true }), { recorded: true, runId: "run-mine" });
  assert.equal(inserts[0].row.run_id, "run-mine");
});

test("판단 저장 실패면 action_record 실패(빨강) 한 줄과 가린 오류", async () => {
  const { db, inserts } = fakeDb(alertWithRun);
  await recordActionOutcome(db, "al-1", { ok: false, message: "저장 실패 API_TOKEN=abc12345" });
  assert.equal(inserts[0].row.status, "failed");
  assert.equal(String(inserts[0].row.error_message).includes("abc12345"), false);
});

test("연결된 실행이 없으면 기록하지 않고 이유만 돌려준다(가짜로 칠하지 않음)", async () => {
  const { db, inserts } = fakeDb({ id: "al-1", changes: { observation_id: null, observations: null } });
  const r = await recordActionOutcome(db, "al-1", { ok: true });
  assert.equal(r.recorded, false);
  assert.equal(inserts.length, 0);
});

test("읽기·쓰기가 실패해도 던지지 않는다(판단 결과는 그대로)", async () => {
  for (const opts of [{ readError: "연결 끊김" }, { insertError: "쓰기 거부" }]) {
    const { db } = fakeDb(alertWithRun, opts);
    const r = await recordActionOutcome(db, "al-1", { ok: true });
    assert.equal(r.recorded, false);
  }
});

test("actionOutcomeOf: 저장 성공·저장 시도 실패만 기록하고, 입력 검사 거절은 기록하지 않는다", async () => {
  const { actionOutcomeOf } = await import("./action-record.ts");
  assert.deepEqual(actionOutcomeOf({ ok: true }), { ok: true });
  const failed = "저장하지 못했어요. 다시 시도해 주세요. 알림은 아직 판단 대기예요.";
  assert.deepEqual(actionOutcomeOf({ ok: false, message: failed }), { ok: false, message: failed });
  for (const m of ["이미 판단한 알림이에요.", "관리자는 판단을 저장할 수 없어요.", "알림을 찾지 못했어요."]) assert.equal(actionOutcomeOf({ ok: false, message: m }), null);
});
