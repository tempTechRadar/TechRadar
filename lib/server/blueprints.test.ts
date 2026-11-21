import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmBlueprint } from "./blueprints.ts";

const ID = "33333333-3333-4333-8333-333333333333";
const SAFE = "11111111-1111-4111-8111-111111111111", RISKY = "22222222-2222-4222-8222-222222222222";
const TECHS = [{ id: SAFE, display_name: "zod", grade: "pass" }, { id: RISKY, display_name: "old-lib", grade: "danger" }];

function fakeDb(rpc: { data?: unknown; error?: string } = { data: "saved" }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    from() { return { select() { return { in: (_k: string, ids: string[]) => Promise.resolve({ data: TECHS.filter((t) => ids.includes(t.id)), error: null }) }; } }; },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      return Promise.resolve({ data: rpc.data ?? null, error: rpc.error ? { message: rpc.error } : null });
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const board = (techIds: string[]) => [[{ name: " 개발 ", techs: techIds.map((id) => ({ id, name: "화면이 보낸 이름" })) }]];

test("확정: DB 함수 하나로(화면이 보낸 기술 이름은 보내지 않음 — DB가 다시 읽음)", async () => {
  const { db, calls } = fakeDb();
  assert.deepEqual(await confirmBlueprint(db, { id: ID, name: " 첫 판 ", projectId: null, board: board([SAFE]) }), { ok: true });
  assert.deepEqual(calls, [{ fn: "confirm_blueprint", args: { p_id: ID, p_name: "첫 판", p_project_id: null, p_board: [[{ name: "개발", techs: [{ id: SAFE }] }]] } }]);
});

test("확정: 같은 id를 다시 보내 DB가 'exists'면 성공(한 줄 그대로, 불변 3)", async () => {
  assert.deepEqual(await confirmBlueprint(fakeDb({ data: "exists" }).db, { id: ID, name: "판", projectId: null, board: board([]) }), { ok: true });
});

test("확정: 위험한 기술 · 없는 기술 · 잘못된 값은 DB를 부르지 않고 막는다", async () => {
  const { db, calls } = fakeDb();
  const risky = await confirmBlueprint(db, { id: ID, name: "판", projectId: null, board: board([SAFE, RISKY]) });
  assert.equal(risky.ok, false);
  assert.match(!risky.ok ? risky.message : "", /old-lib/);
  assert.equal((await confirmBlueprint(db, { id: ID, name: "판", projectId: null, board: board(["44444444-4444-4444-8444-444444444444"]) })).ok, false);
  assert.equal((await confirmBlueprint(db, { id: "x", name: "판", projectId: null, board: board([]) })).ok, false);
  assert.equal((await confirmBlueprint(db, { id: ID, name: " ", projectId: null, board: board([]) })).ok, false);
  assert.equal((await confirmBlueprint(db, { id: ID, name: "판", projectId: "drop", board: board([]) })).ok, false);
  assert.equal(calls.length, 0);
});

test("확정: DB가 거절하거나 답이 이상하면 실패로 알린다(처리 완료로 보이지 않게, 불변 4)", async () => {
  const refused = await confirmBlueprint(fakeDb({ error: "본인 프로젝트가 아니다" }).db, { id: ID, name: "판", projectId: ID, board: board([]) });
  assert.deepEqual(refused, { ok: false, message: "프로젝트를 다시 골라 주세요." });
  assert.equal((await confirmBlueprint(fakeDb({ error: "x" }).db, { id: ID, name: "판", projectId: null, board: board([]) })).ok, false);
  assert.equal((await confirmBlueprint(fakeDb({ data: null }).db, { id: ID, name: "판", projectId: null, board: board([]) })).ok, false);
});
