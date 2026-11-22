import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readRecommendations } from "./recommend-queries.ts";

type Err = { message: string } | null;
type Answer = { data: unknown; error: Err };
type Call = { table: string; filters: [string, unknown][] };
const ok = (data: unknown): Answer => ({ data, error: null });

// 가짜 DB: 표마다 정해 둔 답을 주고, 읽은 표와 거른 값을 남긴다
function fakeDb(answers: Record<string, Answer>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const done = () => answers[table] ?? ok([]);
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (c: string, v: unknown) => (call.filters.push([c, v]), b),
        in: (c: string, v: unknown) => (call.filters.push([c, v]), b),
        neq: () => b, not: () => b, order: () => b, limit: () => b,
        maybeSingle: () => { const a = done(); return Promise.resolve({ data: Array.isArray(a.data) ? a.data[0] ?? null : a.data, error: a.error }); },
        then: (resolve: (a: Answer) => unknown) => resolve(done()),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const tech = (id: string, name: string, downloads: number) => ({
  id, tech_key: `npm:${name}`, display_name: name, one_liner: null, category_id: "s1", grade: "pass", status: "active", signals: { weekly_downloads: downloads },
});
const base = (over: Record<string, Answer> = {}) => ({
  user_tastes: ok({ build: null, tools: [], interests: ["리서치"] }),
  categories: ok([{ id: "b1", name: "리서치", parent_id: null }, { id: "s1", name: "웹 검색·수집", parent_id: "b1" }]),
  technologies: ok([tech("t1", "a", 300), tech("t2", "b", 200), tech("t3", "c", 100), tech("t4", "d", 50)]),
  my_technologies: ok([]),
  tech_marks: ok([{ tech_id: "t1", status: "interest" }, { tech_id: "t2", status: "candidate" }, { tech_id: "t3", status: "hold" }]),
  ...over,
});

test("각 추천에 내 표시(관심·적용 후보·보류·없음)가 붙는다", async () => {
  const view = await readRecommendations(fakeDb(base()).db, "u1", false);
  assert.deepEqual(view.items.map((i) => [i.techId, i.mark]), [["t1", "interest"], ["t2", "candidate"], ["t3", "hold"], ["t4", null]]);
});

test("표시는 내 줄(user_id)만, 추천된 기술 id로만 읽는다", async () => {
  const { db, calls } = fakeDb(base());
  await readRecommendations(db, "u1", false);
  const marks = calls.find((c) => c.table === "tech_marks")!;
  assert.deepEqual(marks.filters.find((f) => f[0] === "user_id"), ["user_id", "u1"]);
  assert.deepEqual([...(marks.filters.find((f) => f[0] === "tech_id")![1] as string[])].sort(), ["t1", "t2", "t3", "t4"]);
});

test("추천이 없으면 표시를 읽지 않는다", async () => {
  const { db, calls } = fakeDb(base({ technologies: ok([]) }));
  const view = await readRecommendations(db, "u1", false);
  assert.deepEqual(view.items, []);
  assert.equal(calls.some((c) => c.table === "tech_marks"), false);
});

test("표시를 못 읽으면 던진다 (표시가 없는 것으로 보이면 관심 버튼이 정한 판단을 덮어쓸 수 있다, 불변 2)", async () => {
  const { db } = fakeDb(base({ tech_marks: { data: null, error: { message: "boom" } } }));
  await assert.rejects(readRecommendations(db, "u1", false), /내 표시를 읽지 못함/);
});
