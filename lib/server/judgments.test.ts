import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveJudgment } from "./judgments.ts";

type Row = Record<string, unknown>;

// 알림 읽기와 save_judgment 호출만 모으는 가짜 클라이언트
function fakeDb(rows: Row[], options: { rpcError?: string; readError?: string } = {}) {
  const rpcCalls: { name: string; args: Row }[] = [];
  let fromCalls = 0;
  const db = {
    from() {
      fromCalls++;
      return {
        select() {
          let result = rows;
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            maybeSingle: () => Promise.resolve(options.readError ? { data: null, error: { message: options.readError } } : { data: result[0] ?? null, error: null }),
          };
          return q;
        },
      };
    },
    rpc(name: string, args: Row) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: options.rpcError ? { message: options.rpcError } : null });
    },
  } as unknown as SupabaseClient;
  return { db, rpcCalls, calls: () => fromCalls + rpcCalls.length };
}

const alertRow = (overrides: Row = {}, fixedVersion: string | null = "0.1.16"): Row => ({
  id: "alert-1",
  user_id: "user-a",
  kind: "security",
  status: "pending",
  created_at: "2026-11-18T01:30:00Z",
  changes: { kind: "grade_to_danger", detected_at: null, prev_value: null, curr_value: { fixed_version: fixedVersion }, technologies: { display_name: "mcp-remote" } },
  my_technologies: null,
  ...overrides,
});

const user = { id: "user-a", role: "user" as const };
const SAVE_FAILED = "저장하지 못했어요. 다시 시도해 주세요. 알림은 아직 판단 대기예요.";

test("적용 후보는 그 알림의 변경에 있는 고친 버전과 함께 save_judgment로 저장한다", async () => {
  const { db, rpcCalls } = fakeDb([alertRow()]);

  const result = await saveJudgment(db, user, { alertId: "alert-1", decision: "candidate", reason: "" });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(rpcCalls, [
    { name: "save_judgment", args: { p_alert_id: "alert-1", p_decision: "candidate", p_reason: null, p_fixed_version: "0.1.16" } },
  ]);
});

test("관리자도 자기 알림에는 판단을 저장한다: 다른 사용자와 같은 규칙으로 DB 함수까지 간다(ADR 0016)", async () => {
  const { db, rpcCalls } = fakeDb([alertRow()]);

  const result = await saveJudgment(db, { id: "user-a", role: "admin" }, { alertId: "alert-1", decision: "candidate", reason: "" });

  assert.deepEqual(result, { ok: true });
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, "save_judgment");
});

test("관리자도 남의 알림에는 판단을 저장하지 않는다: 본인 것만 읽으므로 DB를 부르기 전에 거절한다(불변 1·5)", async () => {
  const { db, rpcCalls } = fakeDb([alertRow({ user_id: "user-b" })]);

  const result = await saveJudgment(db, { id: "user-a", role: "admin" }, { alertId: "alert-1", decision: "candidate", reason: "" });

  assert.deepEqual(result, { ok: false, message: "알림을 찾지 못했어요.", saveAttempted: false });
  assert.equal(rpcCalls.length, 0);
});

test("관리자 계정이어도 보류 이유 5자 미만은 거절한다(같은 규칙)", async () => {
  const { db, rpcCalls } = fakeDb([alertRow()]);

  const result = await saveJudgment(db, { id: "user-a", role: "admin" }, { alertId: "alert-1", decision: "hold", reason: "짧음" });

  assert.equal(result.ok, false);
  assert.equal(rpcCalls.length, 0);
});

test("남의 알림이나 없는 알림은 저장하지 않는다", async () => {
  const { db, rpcCalls } = fakeDb([alertRow({ user_id: "user-b" })]);

  const result = await saveJudgment(db, user, { alertId: "alert-1", decision: "candidate", reason: "" });

  assert.deepEqual(result, { ok: false, message: "알림을 찾지 못했어요.", saveAttempted: false });
  assert.equal(rpcCalls.length, 0);
});

test("이미 판단을 마친 알림은 다시 저장하지 않는다(v1은 판단을 고치지 않음)", async () => {
  const { db, rpcCalls } = fakeDb([alertRow({ status: "done" })]);

  const result = await saveJudgment(db, user, { alertId: "alert-1", decision: "hold", reason: "지금은 바꿀 시간이 없어요" });

  assert.deepEqual(result, { ok: false, message: "이미 판단한 알림이에요.", saveAttempted: false });
  assert.equal(rpcCalls.length, 0);
});

test("입력이 규칙에 어긋나면 DB를 부르지 않는다: 고친 버전이 없는 적용 후보, 5자 미만 보류 이유", async () => {
  const noFix = fakeDb([alertRow({}, null)]);
  const shortReason = fakeDb([alertRow()]);

  const a = await saveJudgment(noFix.db, user, { alertId: "alert-1", decision: "candidate", reason: "" });
  const b = await saveJudgment(shortReason.db, user, { alertId: "alert-1", decision: "hold", reason: "짧음" });

  assert.equal(a.ok, false);
  assert.equal(b.ok, false);
  assert.deepEqual([a.ok === false && a.saveAttempted, b.ok === false && b.saveAttempted], [false, false]);
  assert.equal(noFix.rpcCalls.length + shortReason.rpcCalls.length, 0);
});

test("DB 저장이 실패하면 '아직 판단 대기'라고 알리고 DB 오류 글은 화면에 내보내지 않는다", async () => {
  const { db } = fakeDb([alertRow()], { rpcError: "연결 실패 내부 사정" });

  const result = await saveJudgment(db, user, { alertId: "alert-1", decision: "candidate", reason: "" });

  assert.deepEqual(result, { ok: false, message: SAVE_FAILED, saveAttempted: true });
});

test("판단할 알림을 읽지 못해도 저장 실패로 알리고 DB 저장은 부르지 않는다", async () => {
  const { db, rpcCalls } = fakeDb([alertRow()], { readError: "연결 실패" });

  const result = await saveJudgment(db, user, { alertId: "alert-1", decision: "candidate", reason: "" });

  assert.deepEqual(result, { ok: false, message: SAVE_FAILED, saveAttempted: false });
  assert.equal(rpcCalls.length, 0);
});
