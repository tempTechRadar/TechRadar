import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateIds, confirmBlueprint } from "./blueprints.ts";

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

test("카탈로그 찾기: 공개 칸만 · 공개 목록만(사라짐 · 시뮬레이터 빼고), 앞글자 맞는 것 먼저, 못 읽으면 null", async () => {
  const { findPoolTechs } = await import("./blueprints.ts");
  const calls: string[] = [];
  const rows = { pre: [{ id: "a", display_name: "github-mcp", type: "mcp", grade: "pass", category_id: null, one_liner: null }], any: [{ id: "b", display_name: "my-github", type: "mcp", grade: "pass", category_id: null, one_liner: null }, { id: "a", display_name: "github-mcp", type: "mcp", grade: "pass", category_id: null, one_liner: null }] };
  const fake = (fail = false) => ({
    from(table: string) {
      if (table === "categories") return { select: () => Promise.resolve({ data: [], error: null }) };
      let kind: "pre" | "any" = "any";
      const q = {
        select(cols: string) { calls.push(`select(${cols})`); return q; },
        neq(k: string, v: unknown) { calls.push(`neq(${k},${v})`); return q; },
        not(k: string, op: string, v: unknown) { calls.push(`not(${k},${op},${v})`); return q; },
        eq(k: string, v: unknown) { calls.push(`eq(${k},${v})`); return q; },
        ilike(_k: string, p: string) { kind = p.startsWith("%") ? "any" : "pre"; return q; },
        order() { return q; },
        limit() { return Promise.resolve(fail ? { data: null, error: { message: "x" } } : { data: rows[kind], error: null }); },
      };
      return q;
    },
  }) as unknown as SupabaseClient;
  const r = await findPoolTechs(fake(), "github");
  assert.deepEqual(r?.map((t) => t.name), ["github-mcp", "my-github"]);
  for (const c of ["select(id, display_name, type, grade, category_id, one_liner)", "neq(status,gone)", "not(one_liner_source,is,null)", "eq(is_simulated,false)"]) assert.ok(calls.includes(c), c);
  assert.equal(await findPoolTechs(fake(true), "github"), null);
  assert.deepEqual(await findPoolTechs(fake(), "+"), []); // 찾을 글자가 없으면 묻지 않음
});

test("서랍의 적용 후보 = 보드 칸과 같은 계산: 관심은 빼고, 알림에서 고른 것도 넣고, 더 최근 판단이 이긴다", () => {
  const marks = [
    { tech_id: "a", status: "interest", updated_at: "2026-11-20" },
    { tech_id: "b", status: "candidate", updated_at: "2026-11-18" },
    { tech_id: "c", status: "candidate", updated_at: "2026-11-20" },
  ];
  const alerts = [
    { changes: { tech_id: "b" }, judgments: { decision: "hold", judged_at: "2026-11-19" } }, // 표시 뒤 알림에서 보류 → 빠짐
    { changes: { tech_id: "d" }, judgments: [{ decision: "candidate", judged_at: "2026-11-19" }] }, // 알림에서만 고름 → 들어감
  ];
  assert.deepEqual([...candidateIds(marks, alerts)].sort(), ["c", "d"]);
});
