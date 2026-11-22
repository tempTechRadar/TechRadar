import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readCandidateBoard } from "./candidate-queries.ts";

type Row = Record<string, unknown>;
// 표마다 정한 줄 + eq 조건을 지키는 가짜 클라이언트(dashboard-queries.test.ts와 같은 방식)
function fakeDb(tables: Record<string, Row[]>, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      return {
        select() {
          let result = tables[table] ?? [];
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
}

const tech = (name: string, category_id: string | null = "fe") => ({ display_name: name, grade: "pass", category_id });
const tables = () => ({
  categories: [{ id: "fe", name: "프론트엔드", parent_id: null }],
  tech_marks: [
    { user_id: "me", tech_id: "a", status: "interest", reason: null, updated_at: "2026-11-20", technologies: tech("a") },
    { user_id: "me", tech_id: "b", status: "candidate", reason: null, updated_at: "2026-11-18", technologies: tech("b", null) },
    { user_id: "other", tech_id: "x", status: "candidate", reason: null, updated_at: "2026-11-20", technologies: tech("x") },
  ],
  alerts: [
    { user_id: "me", status: "done", changes: { tech_id: "b", technologies: tech("b", null) }, judgments: { decision: "hold", reason: "다음 달에", judged_at: "2026-11-19" } },
    { user_id: "me", status: "done", changes: { tech_id: "c", technologies: tech("c") }, judgments: [{ decision: "candidate", reason: null, judged_at: "2026-11-19" }] },
  ],
});

test("후보 탭: 내 것만, 표시와 알림 판단 중 더 최근 것(보드 칸과 같은 계산)", async () => {
  const b = await readCandidateBoard(fakeDb(tables()), "me");
  assert.deepEqual([b.interest, b.candidate, b.hold].map((c) => c.map((x) => x.name)), [["a"], ["c"], ["b"]]);
  assert.equal(b.hold[0].note, "다음 달에");
});

test("하나라도 못 읽으면 던진다(빈 칸으로 보이지 않게, 불변 2)", async () => {
  await assert.rejects(readCandidateBoard(fakeDb(tables(), { tech_marks: "timeout" }), "me"));
  await assert.rejects(readCandidateBoard(fakeDb(tables(), { alerts: "timeout" }), "me"));
});
