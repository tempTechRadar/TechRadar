import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateAlertsInput } from "./alerts.ts";
import { makeNotifyOwner } from "./notify-owner.ts";

type Step = Record<string, unknown>;
type Count = number | "error" | "null"; // "error"는 조회 실패, "null"은 오류 없이 건수가 비어 옴
type State = { created: boolean; inserts: number };

// 실제 DB 대신: alerts 건수 조회는 "알림 만들기가 불린 뒤인지"에 따라 before/after 값을 돌려주고,
// 건수 조회에 쓰인 거름 조건(eq·in)과 run_steps에 쓰려는 줄을 모은다.
// 건수를 읽는 순서가 틀리거나(before를 알림 만들기 뒤에 읽는 등) 거름 조건이 빠지면(남의 알림까지 셈) 시험이 실패한다.
function fakeDb(opts: { before: Count; after: Count; failFirstInsert?: boolean }) {
  const state: State = { created: false, inserts: 0 };
  const steps: Step[] = [];
  const filters: unknown[][] = [];
  const db = {
    from(table: string) {
      if (table === "alerts") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              filters.push(["eq", col, val]);
              return {
                in: (col2: string, vals: unknown) => {
                  filters.push(["in", col2, vals]);
                  const c = state.created ? opts.after : opts.before;
                  return Promise.resolve(
                    c === "error" ? { count: null, error: { message: "boom" } } : c === "null" ? { count: null, error: null } : { count: c, error: null },
                  );
                },
              };
            },
          }),
        };
      }
      return {
        insert: (row: Step) => {
          state.inserts++;
          if (opts.failFirstInsert && state.inserts === 1) return Promise.resolve({ error: { message: "insert boom" } });
          steps.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, steps, state, filters };
}

// 알림 만들기 가짜: 받은 인자를 모으고, 불린 뒤라고 표시하고, "모든 사람" 기준의 큰 숫자(99)를 돌려준다
function fakeCreate(state: State) {
  const seen: CreateAlertsInput[] = [];
  const createAlerts = async (_db: SupabaseClient, input: CreateAlertsInput) => {
    seen.push(input);
    state.created = true;
    return 99;
  };
  return { createAlerts, seen };
}

const saved = [{ id: "c1", techId: "t1" }, { id: "c2", techId: "t2" }];
const ctx = { runId: "r1", ownerId: "u1" };

test("알림 만들기에는 실행한 사람과 이 실행을 originRun으로 넘긴다(그 사람의 알림 줄에 run_id를 적게)", async () => {
  const { db, state } = fakeDb({ before: 0, after: 1 });
  const { createAlerts, seen } = fakeCreate(state);
  await makeNotifyOwner(createAlerts)(db, ctx, saved);
  assert.deepEqual(seen.map((s) => s.originRun), [{ ownerId: "u1", runId: "r1" }, { ownerId: "u1", runId: "r1" }]);
});

test("notify는 내 건수만 기록하고(변경 수 → 내 새 알림 수, 호출 전후 차이), 알림 만들기에는 runId를 넘기지 않는다", async () => {
  const { db, steps, state } = fakeDb({ before: 0, after: 1 });
  const { createAlerts, seen } = fakeCreate(state);
  await makeNotifyOwner(createAlerts)(db, ctx, saved);
  // runId를 넘기면 알림 만들기가 그 기술을 쓰는 모든 사람 수·남의 알림 수를 이 실행에 적는다(불변 5)
  assert.deepEqual(seen.map((s) => [s.changeId, s.techId, s.kind, "runId" in s]), [["c1", "t1", "security", false], ["c2", "t2", "security", false]]);
  assert.equal(steps.length, 1);
  assert.deepEqual([steps[0].run_id, steps[0].step_name, steps[0].status, steps[0].count_in, steps[0].count_out, steps[0].output_summary], ["r1", "notify", "succeeded", 2, 1, "내 알림 1건 만듦"]);
});

test("건수는 실행을 시작한 사람의 알림만, 이 실행의 변경만 센다(전·후 두 번 모두) — 남의 알림이 섞이면 안 된다(불변 5)", async () => {
  const { db, state, filters } = fakeDb({ before: 0, after: 1 });
  await makeNotifyOwner(fakeCreate(state).createAlerts)(db, ctx, saved);
  assert.deepEqual(filters, [
    ["eq", "user_id", "u1"], ["in", "change_id", ["c1", "c2"]],
    ["eq", "user_id", "u1"], ["in", "change_id", ["c1", "c2"]],
  ]);
});

test("이미 내 알림이 있으면(다시 읽기) 새로 만든 건 0건", async () => {
  const { db, steps, state } = fakeDb({ before: 1, after: 1 });
  await makeNotifyOwner(fakeCreate(state).createAlerts)(db, ctx, [saved[0]]);
  assert.deepEqual([steps[0].count_in, steps[0].count_out, steps[0].output_summary], [1, 0, "내 알림 0건 만듦"]);
});

test("겹친 실행 때문에 전후 차이가 음수가 되면 0건으로 적는다", async () => {
  const { db, steps, state } = fakeDb({ before: 2, after: 1 });
  await makeNotifyOwner(fakeCreate(state).createAlerts)(db, ctx, saved);
  assert.equal(steps[0].count_out, 0);
});

test("변경이 없으면 알림 만들기도 notify 기록도 하지 않는다", async () => {
  const { db, steps, state } = fakeDb({ before: 0, after: 0 });
  const { createAlerts, seen } = fakeCreate(state);
  await makeNotifyOwner(createAlerts)(db, ctx, []);
  assert.deepEqual([seen.length, steps.length], [0, 0]);
});

test("건수를 못 읽어도(전이든 후든, 오류든 빈 건수든) 알림이 만들어졌다면 실행을 실패로 만들지 않는다(건수 칸은 비움, 0건으로 적지 않음)", async () => {
  for (const counts of [{ before: 0, after: "error" }, { before: "error", after: 1 }, { before: 0, after: "null" }] as const) {
    const { db, steps, state } = fakeDb(counts);
    await makeNotifyOwner(fakeCreate(state).createAlerts)(db, ctx, saved);
    assert.deepEqual([steps[0].status, steps[0].count_in, steps[0].count_out], ["succeeded", 2, null]);
    assert.match(String(steps[0].output_summary), /읽지 못함/);
  }
});

test("알림 만들기가 실패하면 notify 실패로 남기되 사용자가 읽는 글에는 원래 오류를 넣지 않고, 원래 오류를 그대로 던진다", async () => {
  const logged = mock.method(console, "error", () => {});
  try {
    const { db, steps } = fakeDb({ before: 0, after: 0 });
    const boom = new Error("내 기술을 읽지 못함: 남의 사용자 id uuid-of-someone-else");
    const createAlerts = async () => {
      throw boom;
    };
    await assert.rejects(makeNotifyOwner(createAlerts)(db, ctx, saved), (e) => e === boom);
    assert.equal(steps.length, 1);
    assert.deepEqual([steps[0].step_name, steps[0].status, steps[0].error_message], ["notify", "failed", "알림 만들기에 실패함"]);
    assert.ok(!JSON.stringify(steps[0]).includes("uuid-of-someone-else"));
    assert.ok(logged.mock.calls.length >= 1, "자세한 오류는 서버 기록에 남는다");
  } finally {
    logged.mock.restore();
  }
});

test("알림은 만들어졌는데 성공 기록만 실패하면, '알림 만들기 실패' 줄을 또 남기지 않고 기록 실패 오류를 던진다", async () => {
  const { db, steps, state } = fakeDb({ before: 0, after: 1, failFirstInsert: true });
  await assert.rejects(makeNotifyOwner(fakeCreate(state).createAlerts)(db, ctx, saved), /기록하지 못했습니다/);
  assert.deepEqual([steps.length, state.inserts], [0, 1]);
});
