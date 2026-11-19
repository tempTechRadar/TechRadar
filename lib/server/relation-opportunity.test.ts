import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewChange } from "./changes.ts";
import type { CreateAlertsInput } from "./alerts.ts";
import { notifyRelationConfirmed } from "./relation-opportunity.ts";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
type Relation = { tech_a: string; tech_b: string; status: string } | null;

// 같은 역할 줄 하나와 두 기술 이름만 돌려주는 가짜 클라이언트(읽기 전용)
function fakeDb(relation: Relation, readError?: string): SupabaseClient {
  const techs = [{ id: A, tech_key: "npm:tech-a" }, { id: B, tech_key: "npm:tech-b" }];
  return {
    from(table: string) {
      const b: Record<string, unknown> = {};
      const reply = () => (readError ? { data: null, error: { message: readError } } : { data: table === "tech_relations" ? relation : techs, error: null });
      b.select = () => b;
      b.eq = () => b;
      b.in = () => b;
      b.maybeSingle = () => b;
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(reply()).then(resolve, reject);
      return b;
    },
  } as unknown as SupabaseClient;
}

function fakes(over: { saveFails?: string; alertsFail?: (techId: string) => boolean; created?: boolean; alertCount?: number } = {}) {
  const saves: NewChange[] = [];
  const alerts: CreateAlertsInput[] = [];
  const deps = {
    saveChange: async (_db: SupabaseClient, c: NewChange) => {
      if (over.saveFails) throw new Error(over.saveFails);
      saves.push(c);
      return { id: `change-${c.techId.slice(-1)}`, created: over.created ?? true };
    },
    createAlertsForChange: async (_db: SupabaseClient, input: CreateAlertsInput) => {
      alerts.push(input);
      if (over.alertsFail?.(input.techId)) throw new Error("알림을 만들지 못함");
      return over.alertCount ?? 2;
    },
  };
  return { deps, saves, alerts };
}

const confirmed: Relation = { tech_a: A, tech_b: B, status: "confirmed" };

test("확정한 짝은 양쪽 기술마다 same_role_new 변경을 저장하고 적용 기회 알림을 요청한다(만든 알림 수는 합계)", async () => {
  const f = fakes();

  const result = await notifyRelationConfirmed({ db: fakeDb(confirmed), ...f.deps }, "rel-1");

  assert.deepEqual(result, { created: 4, failed: [] });
  assert.deepEqual(f.saves.map((c) => [c.kind, c.techId, c.tech.key, c.causeId]), [
    ["same_role_new", A, "npm:tech-a", "same_role:npm:tech-b"],
    ["same_role_new", B, "npm:tech-b", "same_role:npm:tech-a"],
  ]);
  assert.deepEqual(f.alerts.map((a) => [a.kind, a.techId, a.changeId]), [["opportunity", A, "change-a"], ["opportunity", B, "change-b"]]);
  assert.ok(f.saves.every((c) => c.isSimulated !== true), "진짜 확정은 시연용 표시가 없어야 한다");
});

test("이미 있던 변경이어도 알림은 다시 요청한다(중복은 알림 키가 막고, 아직 못 받은 사람은 받는다)", async () => {
  const f = fakes({ created: false, alertCount: 0 });

  const result = await notifyRelationConfirmed({ db: fakeDb(confirmed), ...f.deps }, "rel-1");

  assert.equal(f.alerts.length, 2);
  assert.deepEqual(result, { created: 0, failed: [] });
});

test("한쪽 알림 만들기가 실패해도 던지지 않고 다른 쪽은 그대로 하며, 실패는 이유와 함께 돌려준다(확정은 이미 저장됨)", async () => {
  const f = fakes({ alertsFail: (techId) => techId === A });

  const result = await notifyRelationConfirmed({ db: fakeDb(confirmed), ...f.deps }, "rel-1");

  assert.equal(result.created, 2);
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /npm:tech-a/);
  assert.match(result.failed[0], /알림을 만들지 못함/);
  assert.equal(f.alerts.length, 2);
});

test("변경 저장이 실패하면 그 쪽은 알림을 요청하지 않고 실패로 돌려준다", async () => {
  const f = fakes({ saveFails: "변경을 저장하지 못함" });

  const result = await notifyRelationConfirmed({ db: fakeDb(confirmed), ...f.deps }, "rel-1");

  assert.equal(f.alerts.length, 0);
  assert.equal(result.created, 0);
  assert.equal(result.failed.length, 2);
});

test("확정이 아니거나 없는 줄, 읽기 실패에는 아무것도 저장하지 않고 이유를 돌려준다", async () => {
  for (const [db, reason] of [
    [fakeDb({ tech_a: A, tech_b: B, status: "candidate" }), /확정/],
    [fakeDb(null), /찾지 못/],
    [fakeDb(confirmed, "연결 실패"), /연결 실패/],
  ] as const) {
    const f = fakes();
    const result = await notifyRelationConfirmed({ db, ...f.deps }, "rel-1");
    assert.equal(result.created, 0);
    assert.equal(result.failed.length, 1);
    assert.match(result.failed[0], reason);
    assert.equal(f.saves.length + f.alerts.length, 0);
  }
});
