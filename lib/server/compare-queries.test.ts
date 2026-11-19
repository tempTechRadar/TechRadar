import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listCatalogTechs, readTechsForCompare } from "./compare-queries.ts";

type Row = Record<string, unknown>;

// 표 이름·정렬·개수 제한·거르기를 모으고 미리 정한 줄을 돌려주는 가짜 클라이언트
function fakeDb(rows: Row[], error?: string) {
  const calls: { table?: string; order?: unknown[]; limit?: number; inIds?: unknown[] } = {};
  const db = {
    from(table: string) {
      calls.table = table;
      return {
        select() {
          let result = rows;
          const q = {
            order(...args: unknown[]) { calls.order = args; return q; },
            limit(n: number) { calls.limit = n; return q; },
            in(col: string, vals: unknown[]) { calls.inIds = vals; result = result.filter((r) => vals.includes(r[col])); return q; },
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error: { message: error } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const techRow = (id: string, name: string, overrides: Row = {}): Row => ({
  id, display_name: name, grade: "pass", grade_reason: "알려진 문제가 없어요", grade_evidence: null, one_liner: `${name} 설명`, one_liner_source: `https://registry.example/${id}`,
  last_activity_at: "2026-11-10T00:00:00Z", last_activity_kind: "release", repo_url: `https://github.com/o/${id}`, license: "MIT", signals: null, ...overrides,
});

test("고르기 목록은 카탈로그 기술을 이름순으로 100개까지 읽고, 없으면 빈 목록, 읽기 실패는 오류(없음과 불러오지 못함은 다르다)", async () => {
  const { db, calls } = fakeDb([techRow("a", "mcp-a"), techRow("b", "mcp-b")]);

  assert.deepEqual(await listCatalogTechs(db), [{ id: "a", name: "mcp-a" }, { id: "b", name: "mcp-b" }]);
  assert.equal(calls.table, "technologies");
  assert.deepEqual(calls.order, ["display_name"]);
  assert.equal(calls.limit, 100);
  assert.deepEqual(await listCatalogTechs(fakeDb([]).db), []);
  await assert.rejects(() => listCatalogTechs(fakeDb([], "연결 실패").db), /기술 목록을 읽지 못함.*연결 실패/);
});

test("고른 기술은 고른 순서대로(DB가 주는 순서가 아니라) 이름과 비교용 값으로 읽고, 찾지 못한 id는 빼며, 읽기 실패는 오류", async () => {
  const { db, calls } = fakeDb([techRow("a", "mcp-a"), techRow("b", "mcp-b", { license: "Apache-2.0" }), techRow("c", "mcp-c")]);

  const found = await readTechsForCompare(db, ["c", "없는-id", "b"]);

  assert.deepEqual(calls.inIds, ["c", "없는-id", "b"]);
  assert.deepEqual(found.map((f) => [f.id, f.name]), [["c", "mcp-c"], ["b", "mcp-b"]]);
  assert.equal(found[1].tech.license, "Apache-2.0");
  assert.equal(found[0].tech.oneLinerSource, "https://registry.example/c");
  await assert.rejects(() => readTechsForCompare(fakeDb([], "연결 실패").db, ["a", "b"]), /비교할 기술을 읽지 못함.*연결 실패/);
});
