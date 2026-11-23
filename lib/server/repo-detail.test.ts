import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readArchivedRepos, readRepoDetail } from "./repo-detail.ts";

type Row = Record<string, unknown>;

// 표마다 정한 줄을 돌려주고 eq · is · not(is null) 조건을 지키는 가짜 클라이언트(status-queries.test.ts와 같은 방식)
function fakeDb(rows: Row[], error?: string) {
  return {
    from() {
      return {
        select() {
          let result = rows;
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            is(col: string, val: unknown) { result = result.filter((r) => (r[col] ?? null) === val); return q; },
            not(col: string, _op: string, val: unknown) { result = result.filter((r) => (r[col] ?? null) !== val); return q; },
            order() { return q; },
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(error ? { data: null, error: { message: error } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
}

const ME = "me", MINE = "11111111-1111-4111-8111-111111111111", THEIRS = "22222222-2222-4222-8222-222222222222", OLD = "33333333-3333-4333-8333-333333333333";
const rows = (): Row[] => [
  { id: MINE, name: "내 레포", kind: "repo", owner_id: ME, archived_at: null, memo: null, my_technologies: [], runs: [] },
  { id: THEIRS, name: "남의 레포", kind: "repo", owner_id: "other", archived_at: null, memo: null, my_technologies: [], runs: [] },
  { id: OLD, name: "보관한 레포", kind: "repo", owner_id: ME, archived_at: "2026-11-20T00:00:00Z", repo_url: null, memo: null, my_technologies: [], runs: [] },
];

test("레포 상세 읽기: 내 것 · 보관 안 한 레포만, 남의 id · 보관한 id · 없는 id는 null(화면이 404)", async () => {
  assert.equal((await readRepoDetail(fakeDb(rows()), ME, MINE))?.name, "내 레포");
  assert.equal(await readRepoDetail(fakeDb(rows()), ME, THEIRS), null, "남의 레포는 없는 것처럼(불변 5)");
  assert.equal(await readRepoDetail(fakeDb(rows()), ME, OLD), null, "보관한 레포는 상세가 없다(보관함에서 되살림)");
  assert.equal(await readRepoDetail(fakeDb(rows()), ME, "44444444-4444-4444-8444-444444444444"), null);
});

test("레포 상세 읽기: 조회가 실패하면 null(없음)이 아니라 던진다(불변 2)", async () => {
  await assert.rejects(readRepoDetail(fakeDb(rows(), "boom"), ME, MINE), /레포를 읽지 못함/);
  await assert.rejects(readArchivedRepos(fakeDb(rows(), "boom"), ME), /보관한 레포를 읽지 못함/);
});

test("보관함: 내 저장소 프로젝트 중 보관한 것만", async () => {
  assert.deepEqual((await readArchivedRepos(fakeDb(rows()), ME)).map((r) => r.id), [OLD]);
  assert.deepEqual(await readArchivedRepos(fakeDb(rows()), "other"), []);
});
