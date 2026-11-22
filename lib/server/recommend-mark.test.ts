import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setInterest } from "./recommend-mark.ts";

type Err = { message: string } | null;
type RpcCall = { name: string; args: Record<string, unknown> };
const TECH = "00000000-0000-4000-8000-000000000001";

// 가짜 DB: 현재 표시를 읽는 답과 rpc(set_tech_mark) 결과를 준다. 부른 rpc를 남긴다
function fakeDb(current: { status: string } | null, readError: Err = null, rpcError: Err = null) {
  const rpcs: RpcCall[] = [];
  const db = {
    from() {
      const b: Record<string, unknown> = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: current, error: readError }) };
      return b;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      return Promise.resolve({ data: [], error: rpcError });
    },
  } as unknown as SupabaseClient;
  return { db, rpcs };
}

test("표시가 없으면 관심으로 저장한다 (이유는 비움)", async () => {
  const { db, rpcs } = fakeDb(null);
  assert.deepEqual(await setInterest(db, "u1", TECH, "interest"), { ok: true });
  assert.deepEqual(rpcs, [{ name: "set_tech_mark", args: { p_tech_id: TECH, p_status: "interest", p_reason: null } }]);
});

test("이미 적용 후보·보류로 정했으면 관심으로 덮어쓰지 않는다", async () => {
  for (const status of ["candidate", "hold"]) {
    const { db, rpcs } = fakeDb({ status });
    const r = await setInterest(db, "u1", TECH, "interest");
    assert.equal(r.ok, false, status);
    assert.match(r.ok ? "" : r.message, /이미 정한 판단/);
    assert.equal(rpcs.length, 0, status);
  }
});

test("이미 관심이면 아무것도 바꾸지 않는다", async () => {
  const { db, rpcs } = fakeDb({ status: "interest" });
  assert.deepEqual(await setInterest(db, "u1", TECH, "interest"), { ok: true });
  assert.equal(rpcs.length, 0);
});

test("관심 지우기는 관심일 때만 지운다 (적용 후보·보류는 지우지 않는다)", async () => {
  const del = fakeDb({ status: "interest" });
  assert.deepEqual(await setInterest(del.db, "u1", TECH, "clear"), { ok: true });
  assert.deepEqual(del.rpcs, [{ name: "set_tech_mark", args: { p_tech_id: TECH, p_status: null, p_reason: null } }]);
  for (const current of [{ status: "candidate" }, { status: "hold" }, null]) {
    const { db, rpcs } = fakeDb(current);
    assert.deepEqual(await setInterest(db, "u1", TECH, "clear"), { ok: true });
    assert.equal(rpcs.length, 0, String(current?.status));
  }
});

test("현재 표시를 못 읽으면 저장하지 않고 알린다", async () => {
  const { db, rpcs } = fakeDb(null, { message: "boom" });
  const r = await setInterest(db, "u1", TECH, "interest");
  assert.equal(r.ok, false);
  assert.equal(rpcs.length, 0);
});

test("저장이 실패하면 저장했다고 하지 않는다 (불변 4)", async () => {
  const r = await setInterest(fakeDb(null, null, { message: "rpc failed" }).db, "u1", TECH, "interest");
  assert.equal(r.ok, false);
});

test("기술 id 모양이 아니면 DB를 부르지 않는다", async () => {
  const { db, rpcs } = fakeDb(null);
  assert.equal((await setInterest(db, "u1", "not-a-uuid", "interest")).ok, false);
  assert.equal(rpcs.length, 0);
});
