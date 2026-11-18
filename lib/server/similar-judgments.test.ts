import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSimilarJudgments } from "./similar-judgments.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// 표마다 미리 정한 줄을 돌려주고 eq 조건을 지켜 주는 가짜 클라이언트
function fakeDb(tables: Tables, errors: Record<string, string> = {}) {
  return {
    from(table: string) {
      return {
        select() {
          let result = tables[table] ?? [];
          const failed = errors[table] ? { data: null, error: { message: errors[table] } } : null;
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            maybeSingle: () => Promise.resolve(failed ?? { data: result[0] ?? null, error: null }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(failed ?? { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
}

const pastAlert = (id: string, userId: string, techId: string, judgedAt: string, extra: Row = {}): Row => ({
  id, user_id: userId, status: "done",
  changes: { tech_id: techId, curr_value: { grade: "danger" }, technologies: { display_name: `기술 ${techId}`, category_id: "cat-9" } },
  judgments: { decision: "hold", reason: "마감이라 나중에", judged_at: judgedAt },
  ...extra,
});

const tables = (): Tables => ({
  alerts: [
    { id: "now", user_id: "user-a", status: "pending", changes: { tech_id: "tech-1", technologies: { category_id: "cat-1" } }, judgments: null },
    pastAlert("same", "user-a", "tech-1", "2026-11-05T00:00:00Z"),
    pastAlert("role-fwd", "user-a", "tech-2", "2026-11-04T00:00:00Z"),
    pastAlert("role-rev", "user-a", "tech-0", "2026-11-03T00:00:00Z"),
    pastAlert("candidate-rel", "user-a", "tech-3", "2026-11-06T00:00:00Z"),
    pastAlert("others", "user-b", "tech-1", "2026-11-07T00:00:00Z"),
    pastAlert("no-judgment", "user-a", "tech-1", "2026-11-08T00:00:00Z", { judgments: null }),
  ],
  tech_relations: [
    { tech_a: "tech-1", tech_b: "tech-2", status: "confirmed" },
    { tech_a: "tech-0", tech_b: "tech-1", status: "confirmed" },
    { tech_a: "tech-1", tech_b: "tech-3", status: "candidate" },
  ],
});

test("내가 판단한 알림 중 같은 기술·확정된 같은 역할(양쪽 방향)을 찾고, 후보 관계·남의 판단·판단 안 한 알림은 뺀다", async () => {
  const found = await readSimilarJudgments(fakeDb(tables()), "user-a", "now");

  assert.deepEqual(found.map((f) => [f.alertId, f.match]), [
    ["same", "same_tech"],
    ["role-fwd", "same_role"],
    ["role-rev", "same_role"],
  ]);
  assert.deepEqual(found[0], {
    alertId: "same", techId: "tech-1", techName: "기술 tech-1", categoryId: "cat-9", decision: "hold",
    reason: "마감이라 나중에", grade: "위험", judgedAt: "2026-11-05T00:00:00Z", match: "same_tech",
  });
});

test("지금 보는 알림이 내 것이 아니거나 없으면 빈 목록", async () => {
  assert.deepEqual(await readSimilarJudgments(fakeDb(tables()), "user-b", "now"), []);
  assert.deepEqual(await readSimilarJudgments(fakeDb(tables()), "user-a", "없는-id"), []);
});

test("읽기에 실패하면 '찾지 못함'으로 삼키지 않고 어디서 실패했는지와 함께 던진다", async () => {
  const cases: [string, RegExp][] = [
    ["alerts", /알림을 읽지 못함.*연결 실패/],
    ["tech_relations", /같은 역할을 읽지 못함.*연결 실패/],
  ];
  for (const [table, expected] of cases) {
    await assert.rejects(() => readSimilarJudgments(fakeDb(tables(), { [table]: "연결 실패" }), "user-a", "now"), expected, table);
  }
});
