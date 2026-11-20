import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readDashboardData } from "./dashboard-queries.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// `projects.archived_at`처럼 이어 붙인 표의 칸도 읽는다
const pick = (r: Row, col: string): unknown => col.split(".").reduce<unknown>((o, k) => (o as Row | null | undefined)?.[k], r);

// 표마다 미리 정한 줄을 돌려주고, 거르기 조건(eq·is)을 지켜 주는 가짜 클라이언트
function fakeDb(tables: Tables, errors: Record<string, string> = {}) {
  const db = {
    from(table: string) {
      return {
        select() {
          let result = tables[table] ?? [];
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            is(col: string, val: unknown) { result = result.filter((r) => (pick(r, col) ?? null) === val); return q; },
            order() { return q; },
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return db;
}

const alertRow: Row = {
  id: "a1", user_id: "user-a", kind: "security", status: "pending", created_at: "2026-11-18T01:30:00Z",
  changes: { kind: "grade_to_danger", detected_at: null, prev_value: null, curr_value: null, technologies: { display_name: "mcp-remote" } },
  my_technologies: { source_file: "package.json", project_id: "proj-1", projects: { name: "TechRadar" } },
};

const tables = (): Tables => ({
  alerts: [alertRow, { ...alertRow, id: "b1", user_id: "user-b" }],
  my_technologies: [
    { owner_id: "user-a", project_id: "proj-1", hidden_at: null },
    { owner_id: "user-a", project_id: null, hidden_at: null },
    { owner_id: "user-a", project_id: "proj-1", hidden_at: "2026-11-18T00:00:00Z" },
    { owner_id: "user-a", project_id: "proj-2", hidden_at: null, projects: { archived_at: "2026-11-01T00:00:00Z" } },
    { owner_id: "user-b", project_id: "proj-9", hidden_at: null },
  ],
  projects: [
    { id: "proj-1", name: "TechRadar", owner_id: "user-a", archived_at: null },
    { id: "proj-2", name: "옛 프로젝트", owner_id: "user-a", archived_at: "2026-11-01T00:00:00Z" },
    { id: "proj-9", name: "남의 것", owner_id: "user-b", archived_at: null },
  ],
});

test("내 알림·숨기지 않은 내 기술(보관한 프로젝트 것 빼고)·보관하지 않은 내 프로젝트만 읽는다", async () => {
  const data = await readDashboardData(fakeDb(tables()), "user-a");

  assert.deepEqual(data.alerts.map((a) => a.id), ["a1"]);
  assert.deepEqual(data.techs, [{ projectId: "proj-1" }, { projectId: null }]);
  assert.deepEqual(data.projects, [{ id: "proj-1", name: "TechRadar" }]);
});

test("어느 하나라도 읽기에 실패하면 0이나 빈 값으로 삼키지 않고 어디서 실패했는지와 함께 던진다", async () => {
  const cases: [string, RegExp][] = [
    ["alerts", /알림을 읽지 못함.*연결 실패/],
    ["my_technologies", /내 기술을 읽지 못함.*연결 실패/],
    ["projects", /프로젝트를 읽지 못함.*연결 실패/],
  ];
  for (const [table, expected] of cases) {
    await assert.rejects(() => readDashboardData(fakeDb(tables(), { [table]: "연결 실패" }), "user-a"), expected, table);
  }
});
