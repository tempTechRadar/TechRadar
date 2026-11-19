import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyAfterBatch, classifyCatalog } from "./classify-store.ts";

type Row = Record<string, unknown>;
// 읽기는 is·eq 조건을 지켜 돌려주고, 고치기(update)는 조건을 적어 두고 조건에 맞는 줄만 바뀐 것으로 돌려준다. 실행 기록(run_steps)은 모아 둔다
function fakeDb(tables: Record<string, Row[]>, opts: { failUpdate?: boolean; failRead?: boolean } = {}) {
  const updates: { patch: Row; ids: string[]; guards: string[] }[] = [];
  const steps: Row[] = [];
  const db = {
    from(table: string) {
      return {
        select() {
          let rows = tables[table] ?? [];
          const q = {
            is(col: string, v: unknown) { rows = rows.filter((r) => (r[col] ?? null) === v); return q; },
            eq(col: string, v: unknown) { rows = rows.filter((r) => r[col] === v); return q; },
            order() { return q; },
            range(a: number, b: number) { rows = rows.slice(a, b + 1); return q; },
            then: (res: (v: unknown) => unknown) => Promise.resolve(opts.failRead ? { data: null, error: { message: "timeout" } } : { data: rows, error: null }).then(res),
          };
          return q;
        },
        update(patch: Row) {
          const u = { patch, ids: [] as string[], guards: [] as string[] };
          const q = {
            in(_: string, ids: string[]) { u.ids = ids; return q; },
            is(col: string, v: unknown) { u.guards.push(`${col}=${v}`); return q; },
            select() { return q; },
            then: (res: (v: unknown) => unknown) => {
              updates.push(u);
              // 읽은 뒤 관리자가 정한 줄(category_set_by)은 조건에 걸려 바뀌지 않는다
              const changed = u.ids.filter((id) => !(tables.technologies ?? []).find((r) => r.id === id)?.category_set_by_later);
              return Promise.resolve(opts.failUpdate ? { data: null, error: { message: "denied" } } : { data: changed.map((id) => ({ id })), error: null }).then(res);
            },
          };
          return q;
        },
        insert(row: Row) { steps.push(row); return Promise.resolve({ error: null }); },
      };
    },
  } as unknown as SupabaseClient;
  return { db, updates, steps };
}

const categories = [
  { id: "big-db", parent_id: null, keywords: null },
  { id: "db", parent_id: "big-db", keywords: ["database", "postgres"] },
  { id: "pay", parent_id: "big-biz", keywords: ["payments"] },
];
const tech = (id: string, name: string, extra: Row = {}): Row => ({ id, display_name: name, one_liner: null, category_id: null, category_set_by: null, is_simulated: false, ...extra });

test("갈래가 비고 관리자가 정하지 않은 진짜 기술만, 규칙으로 정한 것만 저장(저장할 때도 같은 조건을 다시 건다)", async () => {
  const { db, updates } = fakeDb({ categories, technologies: [
    tech("t1", "Postgres helper"), tech("t2", "Stripe payments"), tech("t3", "Mystery"),
    tech("t4", "Postgres admin", { category_set_by: "admin-1" }), tech("t5", "Postgres sim", { is_simulated: true }), tech("t6", "Postgres old", { category_id: "db" }),
  ] });
  const out = await classifyCatalog(db, Date.now() + 60_000);
  assert.deepEqual(updates.map((u) => [u.patch.category_id, u.ids]), [["db", ["t1"]], ["pay", ["t2"]]]);
  assert.ok(updates.every((u) => u.guards.includes("category_id=null") && u.guards.includes("category_set_by=null")));
  assert.equal(out.items, 2);
  assert.match(out.summary, /못 정한 1개는 관리자 확인/);
});

test("읽은 뒤 관리자가 정해 바뀌지 않은 줄은 정한 수에 세지 않는다", async () => {
  const { db } = fakeDb({ categories, technologies: [tech("t1", "Postgres a"), tech("t2", "Postgres b", { category_set_by_later: true })] });
  assert.equal((await classifyCatalog(db, Date.now() + 60_000)).items, 1);
});

test("갈래 목록이 없으면 아무것도 고치지 않고 건너뛰었다고 남긴다(시드 전)", async () => {
  const { db, updates } = fakeDb({ categories: [], technologies: [tech("t1", "Postgres helper")] });
  const out = await classifyCatalog(db, Date.now() + 60_000);
  assert.deepEqual([out.items, updates.length], [0, 0]);
  assert.match(out.summary, /건너뜀/);
});

test("시간이 다 되면 멈추고 다음 실행으로 넘기며, 저장 실패는 삼키지 않는다", async () => {
  const many = Array.from({ length: 250 }, (_, i) => tech(`t${String(i).padStart(3, "0")}`, "Postgres x"));
  let t = 0;
  const { db, updates } = fakeDb({ categories, technologies: many });
  const out = await classifyCatalog(db, 2, () => t++); // 두 번째 묶음 앞에서 시간 끝
  assert.equal(updates.length, 2);
  assert.match(out.summary, /다음 실행에서/);
  const failing = fakeDb({ categories, technologies: [tech("t1", "Postgres helper")] }, { failUpdate: true });
  await assert.rejects(classifyCatalog(failing.db, Date.now() + 60_000), /갈래를 저장하지 못함/);
});

test("묶음 뒤 분류는 같은 실행에 단계 하나로 남고, 실패해도 던지지 않고 실패 단계로 남긴다(수집 오류·재시도 아님)", async () => {
  const ok = fakeDb({ categories, technologies: [tech("t1", "Postgres helper")] });
  await classifyAfterBatch(ok.db, "run-1");
  assert.deepEqual(ok.steps.map((s) => [s.run_id, s.step_name, s.status, s.count_out]), [["run-1", "classify_category", "succeeded", 1]]);
  const bad = fakeDb({ categories }, { failRead: true });
  await classifyAfterBatch(bad.db, "run-2");
  assert.deepEqual(bad.steps.map((s) => [s.step_name, s.status]), [["classify_category", "failed"]]);
  assert.match(String(bad.steps[0].error_message), /갈래 목록을 읽지 못함/);
});
