import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readUsingNow } from "./using-now.ts";

type Answer = { data: unknown; error: { message: string } | null };
// 읽기 전용 가짜 DB: rpc 호출 한 번의 이름과 인자를 남기고 정해 둔 답을 준다
function fakeDb(answer: Answer) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = { rpc: (fn: string, args: unknown) => (calls.push({ fn, args }), Promise.resolve(answer)) } as unknown as SupabaseClient;
  return { db, calls };
}

test("using_now를 기술 id로 부르고 수·별명을 돌려준다(행이 배열로 와도 하나로)", async () => {
  const { db, calls } = fakeDb({ data: [{ user_count: 2, nicknames: ["가나", "다라"] }], error: null });
  assert.deepEqual(await readUsingNow(db, "t1"), { ok: true, count: 2, nicknames: ["가나", "다라"] });
  assert.deepEqual(calls, [{ fn: "using_now", args: { p_tech_id: "t1" } }]);
});

test("행이 객체 하나로 와도 읽는다", async () => {
  const { db } = fakeDb({ data: { user_count: 0, nicknames: [] }, error: null });
  assert.deepEqual(await readUsingNow(db, "t1"), { ok: true, count: 0, nicknames: [] });
});

test("함수가 아직 없거나 호출이 실패하면 실패로 알린다(없는 것처럼 숨기지 않기)", async () => {
  const { db } = fakeDb({ data: null, error: { message: "Could not find the function public.using_now(p_tech_id) in the schema cache" } });
  const r = await readUsingNow(db, "t1");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /쓰고 있어요를 읽지 못함: Could not find the function/);
});

test("오류 문구의 비밀 값은 가린다", async () => {
  const { db } = fakeDb({ data: null, error: { message: "boom ghp_abcdefghijklmnopqrstuvwxyz0123456789ABCD" } });
  const r = await readUsingNow(db, "t1");
  assert.equal(r.ok, false);
  assert.doesNotMatch(r.ok ? "" : r.error, /ghp_/);
});

test("모양이 다른 응답은 실패다(수가 음수·소수·문자, 별명이 문자 목록이 아님, 빈 응답)", async () => {
  for (const data of [null, [], [{ user_count: -1, nicknames: [] }], [{ user_count: 1.5, nicknames: [] }], [{ user_count: "2", nicknames: [] }], [{ user_count: 1, nicknames: [1] }], [{ user_count: 1 }], "x"]) {
    const { db } = fakeDb({ data, error: null });
    const r = await readUsingNow(db, "t1");
    assert.equal(r.ok, false, JSON.stringify(data));
  }
});
