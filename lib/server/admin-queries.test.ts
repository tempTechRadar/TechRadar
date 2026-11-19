// 분류 확인 읽기(readClassify)가 마이그레이션 전 DB에서 깨지지 않게(P-18c 대비책, 11-19 운영 "column technologies.category_set_by does not exist").
// 칼럼 없음만 "갈래 정하기 준비 중"으로 두고, 다른 오류는 지금처럼 던진다(불변 2: 못 읽은 것을 "없음"으로 쓰지 않음).
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn, readClassify } from "./admin-queries.ts";

type Err = { code?: string; message: string };

/** 가짜 DB: 표마다 정한 답을 돌려준다. technologies는 "관리자가 정한 갈래" 조회(category_set_at를 고르는 것)만 따로 답한다 */
function fakeDb(setQuery: { data?: unknown[]; error?: Err }) {
  const db = {
    from(table: string) {
      let cols = "";
      const q: Record<string, unknown> = {};
      for (const m of ["order", "limit", "in", "is", "eq", "not"]) q[m] = () => q;
      q.select = (c: string) => ((cols = c), q);
      q.then = (res: (v: unknown) => unknown) => {
        if (table === "technologies" && cols.includes("category_set_at")) return Promise.resolve({ data: setQuery.data ?? null, error: setQuery.error ?? null }).then(res);
        if (table === "categories") return Promise.resolve({ data: [{ id: "b", name: "큰", parent_id: null }], error: null }).then(res);
        if (table === "technologies") return Promise.resolve({ data: [{ id: "t1", display_name: "a", type: "mcp", tech_key: "npm:a" }], error: null }).then(res);
        return Promise.resolve({ data: [], error: null }).then(res);
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return db;
}

const MISSING = { code: "42703", message: "column technologies.category_set_by does not exist" };

test("칼럼 없음(42703)이면 다른 분류 칸은 그대로 보이고, 관리자가 정한 갈래만 '준비 안 됨'(null)", async () => {
  const data = await readClassify(fakeDb({ error: MISSING }));
  assert.equal(data.categorized, null);
  assert.deepEqual(data.unclassified.map((t) => t.id), ["t1"]);
  assert.equal(data.categories.length, 1);
});

test("코드가 없어도 메시지가 '칼럼이 없다'면 같은 대비책", async () => {
  const data = await readClassify(fakeDb({ error: { message: 'column "category_set_at" does not exist' } }));
  assert.equal(data.categorized, null);
});

test("다른 오류는 지금처럼 던진다(없음으로 바꾸지 않음)", async () => {
  await assert.rejects(readClassify(fakeDb({ error: { code: "42501", message: "permission denied for table technologies" } })), /관리자가 정한 갈래을\(를\) 읽지 못함/);
});

test("정상이면 정한 갈래 목록을 돌려준다", async () => {
  const data = await readClassify(fakeDb({ data: [{ id: "t2", display_name: "b", category_id: "s", category_set_by: "u", category_set_at: "2026-11-19T00:00:00Z", categories: { name: "작은" } }] }));
  assert.deepEqual(data.categorized, [{ id: "t2", name: "b", categoryId: "s", categoryName: "작은", setBy: "u", setAt: "2026-11-19T00:00:00Z" }]);
});

test("isMissingColumn: 42703이나 'column … does not exist'만 참", () => {
  assert.equal(isMissingColumn(MISSING), true);
  assert.equal(isMissingColumn({ message: "column x.y does not exist" }), true);
  assert.equal(isMissingColumn({ code: "42P01", message: 'relation "x" does not exist' }), false);
  assert.equal(isMissingColumn({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingColumn(null), false);
});
