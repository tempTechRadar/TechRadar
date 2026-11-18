import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAlertsForChange } from "./alerts.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;
type Write = { table: string; rows: Row[]; options: { onConflict?: string; ignoreDuplicates?: boolean } };

// 실제 DB 대신 메모리 표로 "무엇을 읽고 무엇을 쓰려 했는지"만 모으는 가짜 클라이언트
function fakeDb(tables: Tables, errors: Record<string, string> = {}) {
  const writes: Write[] = [];
  const inserts: { table: string; row: Row }[] = [];
  const db = {
    from(table: string) {
      const readError = errors[`read:${table}`];
      return {
        insert(row: Row) {
          inserts.push({ table, row });
          return Promise.resolve({ error: errors[`write:${table}`] ? { message: errors[`write:${table}`] } : null });
        },
        select() {
          let result = tables[table] ?? [];
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            in(col: string, vals: unknown[]) { result = result.filter((r) => vals.includes(r[col])); return q; },
            single: () => Promise.resolve(!readError && result.length === 1 ? { data: result[0], error: null } : { data: null, error: { message: readError ?? "한 줄이 아님" } }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(readError ? { data: null, error: { message: readError } } : { data: result, error: null }).then(resolve),
          };
          return q;
        },
        upsert(rows: Row[], options: Write["options"]) {
          writes.push({ table, rows, options });
          const keys = (options.onConflict ?? "").split(",");
          const stored = (tables[table] ??= []);
          const inserted = rows.filter((row) => !stored.some((s) => keys.every((k) => s[k] === row[k])));
          stored.push(...inserted.map((row, i) => ({ id: `${table}-${stored.length + i + 1}`, ...row })));
          const writeError = errors[`write:${table}`];
          return { select: () => Promise.resolve(writeError ? { data: null, error: { message: writeError } } : { data: inserted.map((r) => ({ id: r.id })), error: null }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, writes, inserts, tables };
}

function baseTables(): Tables {
  return {
    changes: [{ id: "change-1", kind: "grade_to_danger", dedupe_key: "mcp-remote|0.1.15|CVE-1|1", is_simulated: false }],
    my_technologies: [
      { id: "mt-a", owner_id: "user-a", tech_id: "tech-1", project_id: "p-a", hidden_at: null },
      { id: "mt-b", owner_id: "user-b", tech_id: "tech-1", project_id: "p-b", hidden_at: null },
      { id: "mt-c", owner_id: "user-c", tech_id: "tech-other", project_id: "p-c", hidden_at: null },
    ],
    projects: [
      { id: "p-a", archived_at: null },
      { id: "p-b", archived_at: null },
      { id: "p-c", archived_at: null },
    ],
    profiles: [
      { id: "user-a", is_demo: false },
      { id: "user-b", is_demo: false },
      { id: "user-c", is_demo: false },
    ],
    alerts: [],
  };
}

const input = { changeId: "change-1", techId: "tech-1", kind: "security" as const };

const FAKE_GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

test("runId가 있으면 notify 단계를 성공으로 기록한다(들어온 사람 수, 만든 알림 수)", async () => {
  const { db, inserts } = fakeDb(baseTables());

  await createAlertsForChange(db, { ...input, runId: "run-1" });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].table, "run_steps");
  assert.equal(inserts[0].row.run_id, "run-1");
  assert.equal(inserts[0].row.step_name, "notify");
  assert.equal(inserts[0].row.status, "succeeded");
  assert.equal(inserts[0].row.count_in, 2);
  assert.equal(inserts[0].row.count_out, 2);
});

test("만들다 실패하면 notify를 실패로 기록하고 원래 오류를 그대로 던진다", async () => {
  const { db, inserts } = fakeDb(baseTables(), { "read:my_technologies": "연결 실패" });

  await assert.rejects(() => createAlertsForChange(db, { ...input, runId: "run-1" }), /내 기술을 읽지 못함.*연결 실패/);

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].row.step_name, "notify");
  assert.equal(inserts[0].row.status, "failed");
  assert.match(String(inserts[0].row.error_message), /연결 실패/);
});

test("실패 기록 자체가 실패해도 원래 오류가 가려지지 않는다", async () => {
  const { db } = fakeDb(baseTables(), { "read:my_technologies": "연결 실패", "write:run_steps": "기록 DB 장애" });

  await assert.rejects(() => createAlertsForChange(db, { ...input, runId: "run-1" }), /내 기술을 읽지 못함.*연결 실패/);
});

test("runId가 없으면 단계를 기록하지 않는다", async () => {
  const { db, inserts } = fakeDb(baseTables());

  await createAlertsForChange(db, input);

  assert.equal(inserts.length, 0);
});

test("읽기가 실패하면 삼키지 않고 어디서 실패했는지와 함께 던지며, 아무것도 쓰지 않는다", async () => {
  const readSteps: [string, RegExp][] = [
    ["changes", /변경을 읽지 못함.*연결 실패/],
    ["my_technologies", /내 기술을 읽지 못함.*연결 실패/],
    ["projects", /프로젝트를 읽지 못함.*연결 실패/],
    ["profiles", /사용자를 읽지 못함.*연결 실패/],
    ["alerts", /알림을 읽지 못함.*연결 실패/],
  ];
  for (const [table, expected] of readSteps) {
    const { db, writes } = fakeDb(baseTables(), { [`read:${table}`]: "연결 실패" });
    await assert.rejects(() => createAlertsForChange(db, input), expected, table);
    assert.equal(writes.length, 0, table);
  }
});

test("쓰기가 실패하면 비밀값을 가린 오류로 던진다", async () => {
  const { db } = fakeDb(baseTables(), { "write:alerts": `연결 실패 ${FAKE_GH}` });

  await assert.rejects(
    () => createAlertsForChange(db, input),
    (e: Error) => /알림을 저장하지 못함/.test(e.message) && e.message.includes("***") && !e.message.includes(FAKE_GH),
  );
});

test("보안 변경이 아닌 줄(같은 역할 새 기술 등)에 보안 알림을 만들라고 하면 오류", async () => {
  const tables = baseTables();
  tables.changes[0].kind = "same_role_new";
  const { db, writes } = fakeDb(tables);

  await assert.rejects(() => createAlertsForChange(db, input), /보안.*same_role_new/);

  assert.equal(writes.length, 0);
});

test("직접 숨긴 줄과 보관한 프로젝트의 기술은 알림에서 뺀다(팀 결정 대기, decideAlerts와 같은 가정)", async () => {
  const tables = baseTables();
  tables.my_technologies[0].hidden_at = "2026-11-18T00:00:00Z";
  tables.projects[1].archived_at = "2026-11-18T00:00:00Z";
  const { db } = fakeDb(tables);

  const created = await createAlertsForChange(db, input);

  assert.equal(created, 0);
  assert.deepEqual(tables.alerts, []);
});

test("시뮬레이터 변경과 onlyDemo는 시연 계정에만 알림을 만든다", async () => {
  const simulated = baseTables();
  simulated.changes[0].is_simulated = true;
  simulated.profiles[1].is_demo = true;
  await createAlertsForChange(fakeDb(simulated).db, input);

  const onlyDemo = baseTables();
  onlyDemo.profiles[0].is_demo = true;
  await createAlertsForChange(fakeDb(onlyDemo).db, { ...input, onlyDemo: true });

  assert.deepEqual(simulated.alerts.map((a) => a.user_id), ["user-b"]);
  assert.deepEqual(onlyDemo.alerts.map((a) => a.user_id), ["user-a"]);
});

test("같은 변경으로 다시 불러도 0건이고, 쓸 게 없으면 쓰기 요청을 보내지 않는다", async () => {
  const { db, writes } = fakeDb(baseTables());

  const first = await createAlertsForChange(db, input);
  const second = await createAlertsForChange(db, input);

  assert.equal(first, 2);
  assert.equal(second, 0);
  assert.equal(writes.length, 1);
});

test("공용 변경이 이미 있어도 나중에 등록한 사람에게는 알림 1건", async () => {
  const tables = baseTables();
  const { db } = fakeDb(tables);
  await createAlertsForChange(db, input);

  tables.my_technologies.push({ id: "mt-d", owner_id: "user-d", tech_id: "tech-1", project_id: "p-d", hidden_at: null });
  tables.projects.push({ id: "p-d", archived_at: null });
  tables.profiles.push({ id: "user-d", is_demo: false });
  const created = await createAlertsForChange(db, input);

  assert.equal(created, 1);
  assert.equal(tables.alerts.filter((a) => a.user_id === "user-d").length, 1);
});

test("그 기술을 쓰는 사람마다 알림 1줄을 올바른 칸으로 쓰고 만든 개수를 돌려준다", async () => {
  const { db, writes } = fakeDb(baseTables());

  const created = await createAlertsForChange(db, input);

  assert.equal(created, 2);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, "alerts");
  assert.deepEqual(writes[0].options, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
  assert.deepEqual(writes[0].rows, [
    { user_id: "user-a", change_id: "change-1", my_technology_id: "mt-a", kind: "security", dedupe_key: "user-a|mcp-remote|0.1.15|CVE-1|1" },
    { user_id: "user-b", change_id: "change-1", my_technology_id: "mt-b", kind: "security", dedupe_key: "user-b|mcp-remote|0.1.15|CVE-1|1" },
  ]);
});
