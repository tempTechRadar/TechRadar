import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readScenarioState } from "./scenario-queries.ts";

type Row = Record<string, any>;

function fakeDb(rows: Row[], readError?: string) {
  const db = {
    from() {
      return {
        select() {
          let result = [...rows];
          const q: any = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            gte(col: string, val: string) { result = result.filter((r) => r[col] >= val); return q; },
            order(col: string, { ascending }: { ascending: boolean }) { result.sort((a, b) => (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1)); return q; },
            limit(n: number) { result = result.slice(0, n); return q; },
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(readError ? { data: null, error: { message: readError } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return db;
}

const NOW = new Date("2026-11-19T05:00:00Z"); // 오늘의 시작: 2026-11-18T15:00:00Z
const scenario = (id: string, alertId: string, createdAt: string, over: Row = {}): Row => ({ id, alert_id: alertId, requested_by: "u1", status: "done", created_at: createdAt, body: { steps: [] }, sources: [], ...over });

test("이 알림의 가장 최근 시나리오와 오늘 내가 요청한 횟수(다른 알림 것도 센다, 어제는 안 셈)를 돌려준다", async () => {
  const db = fakeDb([
    scenario("old", "al-1", "2026-11-19T01:00:00.000Z", { status: "failed" }),
    scenario("new", "al-1", "2026-11-19T04:00:00.000Z"),
    scenario("other", "al-2", "2026-11-19T03:00:00.000Z"),
    scenario("yesterday", "al-1", "2026-11-18T10:00:00.000Z"),
    { ...scenario("someone", "al-1", "2026-11-19T02:00:00.000Z"), requested_by: "u2" },
  ]);

  const state = await readScenarioState(db, "al-1", "u1", NOW);

  assert.equal(state.latest?.id, "new");
  assert.equal(state.usedToday, 3);
});

test("시나리오가 없으면 latest는 null", async () => {
  const state = await readScenarioState(fakeDb([]), "al-1", "u1", NOW);
  assert.deepEqual(state, { latest: null, usedToday: 0 });
});

test("읽기에 실패하면 없다고 속이지 않고 던진다(비밀 값은 가림)", async () => {
  await assert.rejects(() => readScenarioState(fakeDb([], "연결 실패 ghp_" + "a1B2c3D4e5F6g7H8i9J0"), "al-1", "u1", NOW), (error: Error) => /연결 실패/.test(error.message) && !error.message.includes("ghp_"));
});
