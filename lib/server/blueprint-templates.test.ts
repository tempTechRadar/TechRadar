import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TEMPLATE_REFUSED, hideTemplate, readMyTemplates, readPublicTemplates, saveTemplate, setTemplatePublic } from "./blueprint-templates.ts";

const ID = "33333333-3333-4333-8333-333333333333";
const TECH = "11111111-1111-4111-8111-111111111111";
const graph = { v: 2, stages: [{ id: "s1", name: "개발", x: 0, y: 0, techs: [{ id: TECH, name: "zod" }] }], edges: [] };
const board = [[{ name: "개발", techs: [{ id: TECH, name: "zod" }] }]];

/** rpc는 정해 둔 답, from(...)은 정해 둔 줄 · 오류. 부른 것을 남긴다 */
function fakeDb(rpc: { data?: unknown; error?: string } = {}, rows: unknown[] | { error: string } = []) {
  const calls: { fn: string; args?: unknown }[] = [];
  const db = {
    rpc: (fn: string, args?: unknown) => (calls.push({ fn, args }), Promise.resolve({ data: rpc.data ?? null, error: rpc.error ? { message: rpc.error } : null })),
    from: (table: string) => {
      const q = {
        select: () => q, eq: (...a: unknown[]) => (calls.push({ fn: `${table}.eq`, args: a }), q), order: () => q,
        then: (resolve: (x: unknown) => unknown) => resolve(Array.isArray(rows) ? { data: rows, error: null } : { data: null, error: { message: rows.error } }),
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

test("DB 거절 문구의 열쇠는 모두 마이그레이션에 그대로 있다(문구를 바꾸면 여기서 걸린다)", () => {
  const sql = ["202611221000_P-12e_blueprint_graph.sql", "202611221100_P-12e_blueprint_templates.sql"].map((f) => readFileSync(`supabase/migrations/${f}`, "utf8")).join("\n");
  assert.deepEqual(Object.keys(TEMPLATE_REFUSED).filter((k) => !sql.includes(k)), []);
});

test("템플릿 저장: 정리한 이름 · 검사한 그래프로 DB 함수 하나, saved · exists만 성공(같은 id = 한 줄, 불변 3)", async () => {
  const { db, calls } = fakeDb({ data: "saved" });
  assert.deepEqual(await saveTemplate(db, { id: ID, kind: "combo", name: " 내 조합 ", graph }), { ok: true });
  assert.deepEqual(calls, [{ fn: "save_blueprint_template", args: { p_id: ID, p_kind: "combo", p_name: "내 조합", p_graph: graph } }]);
  assert.deepEqual(await saveTemplate(fakeDb({ data: "exists" }).db, { id: ID, kind: "frame", name: "틀", graph }), { ok: true });
  assert.equal((await saveTemplate(fakeDb({ data: null }).db, { id: ID, kind: "frame", name: "틀", graph })).ok, false, "이상한 답은 실패(불변 4)");
});

test("템플릿 저장: 잘못된 id · 종류 · 이름 · 그래프는 DB를 부르지 않는다, DB 거절은 쉬운 말로", async () => {
  const { db, calls } = fakeDb({ data: "saved" });
  for (const bad of [{ id: "x", kind: "combo", name: "a", graph }, { id: ID, kind: "note", name: "a", graph }, { id: ID, kind: "combo", name: " ", graph }, { id: ID, kind: "combo", name: "a", graph: { v: 1 } }]) {
    assert.equal((await saveTemplate(db, bad)).ok, false);
  }
  assert.equal(calls.length, 0);
  const r = await saveTemplate(fakeDb({ error: "고른 적 없는 기술은 청사진에 넣지 않는다(내 기술 · 적용 후보 · 내 이력만): zod" }).db, { id: ID, kind: "combo", name: "a", graph });
  assert.match(r.ok ? "" : r.message, /틀로 저장하거나/);
  assert.match((await saveTemplate(fakeDb({ error: "boom" }).db, { id: ID, kind: "combo", name: "a", graph }) as { message: string }).message, /저장하지 못했어요/);
});

test("공개 · 숨김: DB가 돌려준 값이 바라던 값일 때만 성공, 거절은 쉬운 말로", async () => {
  const pub = fakeDb({ data: true });
  assert.deepEqual(await setTemplatePublic(pub.db, ID, true), { ok: true });
  assert.deepEqual(pub.calls, [{ fn: "set_template_public", args: { p_id: ID, p_public: true } }]);
  assert.equal((await setTemplatePublic(fakeDb({ data: false }).db, ID, true)).ok, false);
  assert.match((await setTemplatePublic(fakeDb({ error: "관리자가 숨긴 템플릿은 공개할 수 없다" }).db, ID, true) as { message: string }).message, /관리자가 숨긴/);
  assert.equal((await setTemplatePublic(fakeDb({ data: true }).db, "x", true)).ok, false);
  assert.deepEqual(await hideTemplate(fakeDb({ data: true }).db, ID, true), { ok: true });
  assert.match((await hideTemplate(fakeDb({ error: "관리자만 숨길 수 있다" }).db, ID, true) as { message: string }).message, /관리자만/);
});

test("공개 거절(공개 목록 밖 기술): 개수 · 이름을 쉬운 말로, DB 문구는 마이그레이션과 같다", async () => {
  const r = await setTemplatePublic(fakeDb({ error: "공개 목록에 없는 기술 2개: my-private-pkg, old-lib" }).db, ID, true);
  assert.equal(r.ok ? "" : r.message, "공개할 수 없어요: 공개 목록에 없는 기술 2개(my-private-pkg, old-lib)를 빼 주세요. 그 기술을 뺀 조합이나 틀로 새로 저장하면 공개할 수 있어요.");
  assert.match(readFileSync("supabase/migrations/202611221320_P-12f_template_public_gate.sql", "utf8"), /공개 목록에 없는 기술 %개: %/);
});

test("갤러리: 별명 · 쓰인 수만(사람 id 칸이 와도 옮기지 않음), 모양이 틀린 줄은 뺀다, 못 읽으면 던진다(불변 2)", async () => {
  const row = { id: ID, kind: "combo", name: "조합", graph, board, author_nickname: "작가", uses: 3, created_at: "2026-11-22T00:00:00Z", author_id: "leak" };
  const { db, calls } = fakeDb({ data: [row, { ...row, id: "bad", graph: { v: 9 } }] });
  const list = await readPublicTemplates(db, "combo");
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ["authorNickname", "board", "createdAt", "graph", "id", "kind", "name", "uses"]);
  assert.deepEqual([list[0].authorNickname, list[0].uses], ["작가", 3]);
  assert.deepEqual(calls[0], { fn: "public_blueprint_templates", args: { p_kind: "combo", p_limit: 60, p_offset: 0 } });
  await assert.rejects(readPublicTemplates(fakeDb({ error: "boom" }).db), /공개 템플릿을 읽지 못함/);
});

test("내 템플릿: 본인 것만(author_id 조건), 공개 · 숨김 표시, 못 읽으면 던진다", async () => {
  const row = { id: ID, kind: "frame", name: "틀", graph, board, is_public: true, hidden_at: "2026-11-22T00:00:00Z", created_at: "2026-11-22T00:00:00Z" };
  const { db, calls } = fakeDb({}, [row]);
  const mine = await readMyTemplates(db, "u1");
  assert.deepEqual([mine.length, mine[0].isPublic, mine[0].hidden], [1, true, true]);
  assert.deepEqual(calls[0], { fn: "blueprint_templates.eq", args: ["author_id", "u1"] });
  await assert.rejects(readMyTemplates(fakeDb({}, { error: "boom" }).db, "u1"), /내 템플릿을 읽지 못함/);
});

test("템플릿 열기(이 템플릿으로 시작): 쓸 수 있으면 그래프, 없으면 null, 잘못된 id는 DB를 안 부름, 못 읽으면 던진다", async () => {
  const { readTemplateForUse } = await import("./blueprint-templates.ts");
  const frame = { ...graph, stages: [{ ...graph.stages[0], techs: [] }] };
  const ok = fakeDb({ data: [{ id: ID, kind: "frame", name: "틀", graph: frame }] });
  assert.deepEqual(await readTemplateForUse(ok.db, ID), { id: ID, kind: "frame", name: "틀", graph: frame, outsideGate: [] });
  assert.deepEqual(ok.calls, [{ fn: "blueprint_template_for_use", args: { p_id: ID } }], "기술 없는 틀은 관문을 읽지 않는다");
  assert.equal(await readTemplateForUse(fakeDb({ data: [] }).db, ID), null);
  const none = fakeDb({ data: [] });
  assert.equal(await readTemplateForUse(none.db, "x"), null);
  assert.equal(none.calls.length, 0);
  await assert.rejects(readTemplateForUse(fakeDb({ error: "boom" }).db, ID), /템플릿을 읽지 못함/);
});

test("남의 조합 열기: 내 관문 밖 기술은 outsideGate로(화면이 후보 칩으로, ADR 0034 1), 관문을 못 읽으면 던진다(빈 관문으로 단정 안 함)", async () => {
  const { readTemplateForUse } = await import("./blueprint-templates.ts");
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const combo = { ...graph, stages: [{ ...graph.stages[0], techs: [{ id: TECH, name: "zod" }, { id: OTHER, name: "x" }] }] };
  const db = (gate: { data?: string[]; error?: string }) => ({
    rpc: (fn: string) => Promise.resolve(fn === "my_blueprint_tech_ids"
      ? { data: gate.data ?? null, error: gate.error ? { message: gate.error } : null }
      : { data: [{ id: ID, kind: "combo", name: "조합", graph: combo }], error: null }),
  }) as unknown as SupabaseClient;
  assert.deepEqual((await readTemplateForUse(db({ data: [TECH] }), ID))?.outsideGate, [OTHER]);
  await assert.rejects(readTemplateForUse(db({ error: "boom" }), ID), /읽지 못함/);
});
