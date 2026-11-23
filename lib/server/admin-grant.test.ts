import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GRANT_TEXT, REVOKE_TEXT, grantAdmin, revokeAdmin } from "./admin-grant.ts";

const TARGET = "00000000-0000-4000-8000-000000000001";
const REASON = "운영 점검을 같이 맡기로 해서";

type Rpc = { fn: string; args: Record<string, unknown> };
// 가짜 DB: rpc 한 번에 정해 둔 답을 주고, 부른 내용을 남긴다
function fakeDb(answer: { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Rpc[] = [];
  const db = { rpc: (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), Promise.resolve(answer)) } as unknown as SupabaseClient;
  return { db, calls };
}

test("관리자 지정: DB 함수 하나만 부르고 다듬은 사유를 넘긴다", async () => {
  const { db, calls } = fakeDb({ data: "granted", error: null });
  const r = await grantAdmin(db, TARGET, `  ${REASON}  `);
  assert.deepEqual(r, { ok: true, code: "granted" });
  assert.deepEqual(calls, [{ fn: "admin_grant_admin", args: { p_target: TARGET, p_reason: REASON } }]);
});

test("관리자 지정: 사유가 짧거나 비밀값처럼 보이면 DB를 부르지 않는다", async () => {
  for (const reason of ["", "짧음", "👍👍👍", "x".repeat(301), "SUPABASE_SERVICE_ROLE_KEY=abcdefghijklmnop"]) {
    const { db, calls } = fakeDb({ data: "granted", error: null });
    assert.deepEqual(await grantAdmin(db, TARGET, reason), { ok: false, code: "reason" });
    assert.equal(calls.length, 0, reason);
  }
});

test("관리자 지정: 회원 id 모양이 아니면 DB를 부르지 않는다", async () => {
  const { db, calls } = fakeDb({ data: "granted", error: null });
  assert.deepEqual(await grantAdmin(db, "1 or 1=1", REASON), { ok: false, code: "not_found" });
  assert.equal(calls.length, 0);
});

test("관리자 지정: DB 함수의 답을 그대로 코드로 옮긴다", async () => {
  const cases: [unknown, boolean, string][] = [["already", true, "already"], ["demo", false, "demo"], ["not_found", false, "not_found"], ["reason", false, "reason"], ["뭔가 다른 답", false, "failed"], [null, false, "failed"]];
  for (const [data, ok, code] of cases) {
    const { db } = fakeDb({ data, error: null });
    assert.deepEqual(await grantAdmin(db, TARGET, REASON), { ok, code }, String(data));
  }
});

test("관리자 지정: 관리자가 아니면(DB 42501) 막혔다고, 함수가 없으면 적용 대기라고, 그 밖의 오류는 실패", async () => {
  const cases: [string | undefined, string][] = [["42501", "forbidden"], ["PGRST202", "missing"], ["42883", "missing"], ["XX000", "failed"], [undefined, "failed"]];
  for (const [errCode, code] of cases) {
    const { db } = fakeDb({ data: null, error: { message: "db said", code: errCode } });
    assert.deepEqual(await grantAdmin(db, TARGET, REASON), { ok: false, code }, String(errCode));
  }
});

test("관리자 지정: 모든 결과에 화면 문장이 있고, 실패 문장은 아무것도 안 바뀌었다고 말한다", () => {
  for (const code of ["missing", "failed", "no_db"] as const) assert.match(GRANT_TEXT[code], /아무것도 바뀌지 않았어요/);
  assert.match(GRANT_TEXT.granted, /바꾼 기록/);
});

test("되돌리기: DB 함수 admin_revoke_admin 하나만 부르고 다듬은 사유를 넘긴다", async () => {
  const { db, calls } = fakeDb({ data: "revoked", error: null });
  assert.deepEqual(await revokeAdmin(db, TARGET, `  ${REASON}  `), { ok: true, code: "revoked" });
  assert.deepEqual(calls, [{ fn: "admin_revoke_admin", args: { p_target: TARGET, p_reason: REASON } }]);
});

test("되돌리기: 사유·id가 이상하면 DB를 부르지 않는다", async () => {
  for (const [id, reason, code] of [[TARGET, "짧음", "reason"], [TARGET, "👍👍👍", "reason"], ["x", REASON, "not_found"]] as const) {
    const { db, calls } = fakeDb({ data: "revoked", error: null });
    assert.deepEqual(await revokeAdmin(db, id, reason), { ok: false, code });
    assert.equal(calls.length, 0);
  }
});

test("되돌리기: 자기 자신 · 마지막 관리자 · 이미 일반을 DB 답 그대로 옮긴다", async () => {
  const cases: [unknown, boolean, string][] = [["self", false, "self"], ["last_admin", false, "last_admin"], ["not_admin", true, "not_admin"], ["not_found", false, "not_found"], ["granted", false, "failed"]];
  for (const [data, ok, code] of cases) {
    const { db } = fakeDb({ data, error: null });
    assert.deepEqual(await revokeAdmin(db, TARGET, REASON), { ok, code }, String(data));
  }
});

test("되돌리기: 권한 없음·함수 없음·그 밖의 오류", async () => {
  for (const [errCode, code] of [["42501", "forbidden"], ["PGRST202", "missing"], ["XX000", "failed"]] as const) {
    const { db } = fakeDb({ data: null, error: { message: "db said", code: errCode } });
    assert.deepEqual(await revokeAdmin(db, TARGET, REASON), { ok: false, code });
  }
});

test("되돌리기: 거절 문장은 아무것도 안 바뀌었다고 말한다", () => {
  for (const code of ["self", "last_admin", "missing", "failed"] as const) assert.match(REVOKE_TEXT[code], /아무것도 바뀌지 않았어요/);
  assert.match(REVOKE_TEXT.revoked, /바꾼 기록/);
});
