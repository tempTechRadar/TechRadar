import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { candidateIds, confirmBlueprint, confirmBlueprintGraph } from "./blueprints.ts";

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

const graph = (techIds: string[]) => ({ v: 2, stages: [{ id: "s1", name: "개발", x: 0, y: 0, techs: techIds.map((id) => ({ id, name: "화면이 보낸 이름" })) }], edges: [] });

test("v2 확정: 그래프를 DB 함수 confirm_blueprint_v2 하나로 보낸다(모양 · 한도 · 고리 · 이름 · 위험 · 관문은 DB가 본다)", async () => {
  const { db, calls } = fakeDb();
  const g = graph([SAFE]);
  assert.deepEqual(await confirmBlueprintGraph(db, { id: ID, name: " 캔버스 ", projectId: null, graph: g }), { ok: true });
  assert.deepEqual(calls, [{ fn: "confirm_blueprint_v2", args: { p_id: ID, p_name: "캔버스", p_project_id: null, p_graph: g } }]);
  assert.deepEqual(await confirmBlueprintGraph(fakeDb({ data: "exists" }).db, { id: ID, name: "캔버스", projectId: null, graph: g }), { ok: true }, "같은 id = 한 줄(불변 3)");
});

test("v2 확정: 겉모양이 틀리면(단계 없음 · v2 아님 · 잘못된 id · 이름 없음) DB를 부르지 않는다", async () => {
  const { db, calls } = fakeDb();
  for (const bad of [{ v: 2, stages: [], edges: [] }, { v: 1, stages: [{}] }, null, "x"]) assert.equal((await confirmBlueprintGraph(db, { id: ID, name: "판", projectId: null, graph: bad })).ok, false);
  assert.equal((await confirmBlueprintGraph(db, { id: "x", name: "판", projectId: null, graph: graph([]) })).ok, false);
  assert.equal((await confirmBlueprintGraph(db, { id: ID, name: " ", projectId: null, graph: graph([]) })).ok, false);
  assert.equal(calls.length, 0);
});

test("v2 확정: DB 거절 문구를 쉬운 말로(관문 · 위험 · 고리 · 한도), 모르는 오류·이상한 답은 실패(불변 4)", async () => {
  const say = async (error: string) => { const r = await confirmBlueprintGraph(fakeDb({ error }).db, { id: ID, name: "판", projectId: null, graph: graph([SAFE]) }); return r.ok ? "" : r.message; };
  assert.match(await say("고른 적 없는 기술은 청사진에 넣지 않는다(내 기술 · 적용 후보 · 내 이력만)"), /적용 후보로 고른 뒤/);
  assert.match(await say("위험 등급 기술은 청사진에 넣지 않는다"), /위험한 기술/);
  assert.match(await say("연결선이 돌아 순서를 정할 수 없다(사이클)"), /연결 하나를 끊어/);
  assert.match(await say("같은 깊이의 단계는 4개까지"), /4개까지/);
  assert.match(await say("boom"), /확정하지 못했어요/);
  assert.equal((await confirmBlueprintGraph(fakeDb({ data: null }).db, { id: ID, name: "판", projectId: null, graph: graph([]) })).ok, false);
});

test("v2 확정: 고리 · 한도처럼 parseGraph가 아는 잘못은 DB를 부르지 않고 그 문구로 알린다", async () => {
  const { db, calls } = fakeDb();
  const loop = { v: 2, stages: [{ id: "a", name: "a", x: 0, y: 0, techs: [] }, { id: "b", name: "b", x: 0, y: 0, techs: [] }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] };
  const r = await confirmBlueprintGraph(db, { id: ID, name: "판", projectId: null, graph: loop });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("확정본 하나의 그래프 읽기: 본인 것만(user_id 조건), 옛 v1 확정본은 null, 못 읽으면 던진다(불변 2)", async () => {
  const { readBlueprintGraph } = await import("./blueprints.ts");
  const g = { v: 2, stages: [{ id: "s1", name: "a", x: 0, y: 0, techs: [] }], edges: [] };
  const seen: unknown[][] = [];
  const fake = (data: unknown, error: string | null = null) => ({
    from: () => { const q = { select: () => q, eq: (...a: unknown[]) => (seen.push(a), q), maybeSingle: async () => ({ data, error: error ? { message: error } : null }) }; return q; },
  }) as unknown as SupabaseClient;
  assert.deepEqual(await readBlueprintGraph(fake({ graph: g }), "u1", ID), g);
  assert.deepEqual(seen.slice(0, 2), [["user_id", "u1"], ["id", ID]]);
  assert.equal(await readBlueprintGraph(fake({ graph: null }), "u1", ID), null);
  assert.equal(await readBlueprintGraph(fake(null), "u1", ID), null);
  assert.equal(await readBlueprintGraph(fake({ graph: g }), "u1", "not-a-uuid"), null);
  await assert.rejects(readBlueprintGraph(fake(null, "boom"), "u1", ID), /읽지 못함/);
});

test("청사진에 넣을 수 있는 기술 = DB 관문과 같은 목록(my_blueprint_tech_ids), 못 읽으면 던진다", async () => {
  const { readAllowedTechIds } = await import("./blueprints.ts");
  const { db, calls } = fakeDb({ data: [SAFE, ID] });
  assert.deepEqual([...(await readAllowedTechIds(db))], [SAFE, ID]);
  assert.deepEqual(calls, [{ fn: "my_blueprint_tech_ids", args: undefined }]);
  await assert.rejects(readAllowedTechIds(fakeDb({ error: "boom" }).db), /읽지 못함/);
});

test("DB 거절 문구의 열쇠는 모두 마이그레이션에 그대로 있다(문구를 바꾸면 여기서 걸린다 — 쉬운 말이 조용히 사라지지 않게)", async () => {
  const { readFileSync } = await import("node:fs");
  const { DB_REFUSED } = await import("./blueprints.ts");
  const sql = ["202611211000_P-12d_blueprints.sql", "202611221000_P-12e_blueprint_graph.sql"].map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  assert.deepEqual(Object.keys(DB_REFUSED).filter((k) => !sql.includes(k)), []);
});

test("관문 · 위험 등급 거절은 막힌 기술 이름을 함께 알린다", async () => {
  const r = await confirmBlueprintGraph(fakeDb({ error: "고른 적 없는 기술은 청사진에 넣지 않는다(내 기술 · 적용 후보 · 내 이력만): old-lib" }).db, { id: ID, name: "판", projectId: null, graph: graph([SAFE]) });
  assert.match(r.ok ? "" : r.message, /\(old-lib\)$/);
});
