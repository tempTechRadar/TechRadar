import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readStatusData } from "./status-queries.ts";

type Row = Record<string, unknown>;

// 표마다 정한 줄을 돌려주고 eq · is 조건을 지키는 가짜 클라이언트(dashboard-queries.test.ts와 같은 방식). range는 그대로 돌려줌
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      return {
        select() {
          let result = tables[table] ?? [];
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            is(col: string, val: unknown) { result = result.filter((r) => (r[col] ?? null) === val); return q; },
            order() { return q; },
            range() { return q; },
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] }, count: null } : { data: result, error: null, count: result.length }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
}

const project = (id: string, owner: string, o: Row = {}): Row => ({ id, name: id, kind: "repo", owner_id: owner, archived_at: null, my_technologies: [], runs: [], ...o });
const tables = () => ({
  projects: [project("p1", "me"), project("p2", "other"), project("old", "me", { archived_at: "2026-11-01T00:00:00Z" })],
  my_tech_tags: [{ user_id: "me", tech_id: "t1", tag: "시연" }, { user_id: "other", tech_id: "t1", tag: "남의 것" }],
});

test("현황 읽기: 내 것 · 보관 안 한 프로젝트만, 내 태그만", async () => {
  const d = await readStatusData(fakeDb(tables()), "me");
  assert.deepEqual(d.projects.map((p) => p.id), ["p1"]);
  assert.deepEqual(d.tags?.get("t1"), ["시연"]);
});

test("내 태그만 못 읽으면 tags = null(태그 없음과 다르게), 프로젝트를 못 읽으면 던진다(불변 2)", async () => {
  const noTags = await readStatusData(fakeDb(tables(), { my_tech_tags: "timeout" }), "me");
  assert.equal(noTags.tags, null);
  assert.equal(noTags.projects.length, 1);
  await assert.rejects(readStatusData(fakeDb(tables(), { projects: "timeout" }), "me"), /내 프로젝트를 읽지 못함/);
});
