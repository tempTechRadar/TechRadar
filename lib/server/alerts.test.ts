import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { createAlertsForChange as createWithDeps, type AlertDeps } from "./alerts.ts";

// 기존 시험은 알림 만들기만 본다: 초안은 부르지 않는 가짜 의존을 끼운다(초안 연결은 파일 맨 끝 시험이 본다)
const noDraft: AlertDeps = { aiClient: () => null, generateDraft: async () => ({ status: "skipped", reason: "not_security" }) };
const createAlertsForChange = (db: SupabaseClient, input: Parameters<typeof createWithDeps>[1]) => createWithDeps(db, input, noDraft);

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
          let ranged = false;
          const q = {
            order() { return q; },
            // 실제 DB처럼: 범위를 정하지 않으면 1000줄에서 자른다
            range(from: number, to: number) { ranged = true; result = result.slice(from, to + 1); return q; },
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            in(col: string, vals: unknown[]) { if (vals.length > 100) throw new Error("주소가 너무 김"); result = result.filter((r) => vals.includes(r[col])); return q; },
            single: () => Promise.resolve(!readError && result.length === 1 ? { data: result[0], error: null } : { data: null, error: { message: readError ?? "한 줄이 아님" } }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(readError ? { data: null, error: { message: readError } } : { data: ranged ? result : result.slice(0, 1000), error: null }).then(resolve),
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

  await assert.rejects(() => createAlertsForChange(db, { ...input, runId: "run-1" }), /사용 중인 항목을 읽지 못함.*연결 실패/);

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].row.step_name, "notify");
  assert.equal(inserts[0].row.status, "failed");
  assert.match(String(inserts[0].row.error_message), /연결 실패/);
});

test("실패 기록 자체가 실패해도 원래 오류가 가려지지 않는다", async () => {
  const { db } = fakeDb(baseTables(), { "read:my_technologies": "연결 실패", "write:run_steps": "기록 DB 장애" });

  await assert.rejects(() => createAlertsForChange(db, { ...input, runId: "run-1" }), /사용 중인 항목을 읽지 못함.*연결 실패/);
});

test("runId가 없으면 단계를 기록하지 않는다", async () => {
  const { db, inserts } = fakeDb(baseTables());

  await createAlertsForChange(db, input);

  assert.equal(inserts.length, 0);
});

test("읽기가 실패하면 삼키지 않고 어디서 실패했는지와 함께 던지며, 아무것도 쓰지 않는다", async () => {
  const readSteps: [string, RegExp][] = [
    ["changes", /변경을 읽지 못함.*연결 실패/],
    ["my_technologies", /사용 중인 항목을 읽지 못함.*연결 실패/],
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

const manyUsers = (n: number) => ({
  my_technologies: Array.from({ length: n }, (_, i) => ({ id: `mt-${i}`, owner_id: `u-${i}`, tech_id: "tech-1", project_id: `p-${i}`, hidden_at: null })),
  projects: Array.from({ length: n }, (_, i) => ({ id: `p-${i}`, archived_at: null })),
  profiles: Array.from({ length: n }, (_, i) => ({ id: `u-${i}`, is_demo: false })),
});

test("쓰는 사람이 1000명을 넘고 목록이 길어도 모두에게 알림을 만든다(.in() 길이·1000줄 한도)", async () => {
  const { db, tables } = fakeDb({ ...baseTables(), ...manyUsers(1500) });

  const created = await createAlertsForChange(db, input);

  assert.equal(created, 1500);
  assert.equal(tables.alerts.length, 1500);
});

test("이미 알림이 1000건을 넘게 있어도 다시 불러 0건이다(기존 키를 잘리지 않게 읽는다)", async () => {
  const { db } = fakeDb({ ...baseTables(), ...manyUsers(1200) });
  await createAlertsForChange(db, input);

  assert.equal(await createAlertsForChange(db, input), 0);
});

test("변경의 버전과 다른 버전을 쓰는 사람에게는 알림을 만들지 않는다(SPEC-3.1)", async () => {
  const tables = baseTables();
  tables.changes[0].version = "0.1.15";
  tables.my_technologies[0].version = "0.1.15";
  tables.my_technologies[1].version = "0.2.0";
  const { db, tables: stored } = fakeDb(tables);

  assert.equal(await createAlertsForChange(db, input), 1);
  assert.deepEqual(stored.alerts.map((a) => a.user_id), ["user-a"]);
});

test("버전을 모르는 변경은 버전을 모르는 줄에만, 변경에 버전이 있으면 모르는 줄은 받지 않는다", async () => {
  const tables = baseTables();
  tables.changes[0].version = null;
  tables.my_technologies[0].version = null;
  tables.my_technologies[1].version = "1.0.0";
  const { db, tables: stored } = fakeDb(tables);

  await createAlertsForChange(db, input);

  assert.deepEqual(stored.alerts.map((a) => a.user_id), ["user-a"]);
});

test("시뮬레이터 변경은 버전을 보지 않는다(시연 계정이 어떤 버전이어도 알림이 나와야 해서)", async () => {
  const tables = baseTables();
  tables.changes[0].is_simulated = true;
  tables.changes[0].version = "9.9.9";
  tables.profiles[0].is_demo = true;
  tables.my_technologies[0].version = "0.1.15";
  const { db } = fakeDb(tables);

  assert.equal(await createAlertsForChange(db, input), 1);
});

test("notify 기록을 못 남겨도 이미 만든 알림은 그대로고 만든 개수를 돌려준다(기록 실패는 알림을 막지 않는다)", async () => {
  const { db, tables } = fakeDb(baseTables(), { "write:run_steps": "기록 DB 장애" });
  const logged = console.error;
  console.error = () => {};
  try {
    assert.equal(await createAlertsForChange(db, { ...input, runId: "run-1" }), 2);
  } finally {
    console.error = logged;
  }
  assert.equal(tables.alerts.length, 2);
});

test("originRun이 있으면 그 사람의 알림 줄에만 run_id를 적고 남의 줄은 비운다(남의 실행에 연결하지 않음)", async () => {
  const { db, tables } = fakeDb(baseTables());

  await createAlertsForChange(db, { ...input, originRun: { ownerId: "user-a", runId: "run-a" } });

  const runIdOf = (userId: string) => tables.alerts.find((a) => a.user_id === userId)?.run_id;
  assert.equal(runIdOf("user-a"), "run-a");
  assert.equal(runIdOf("user-b"), undefined);
});

test("시뮬레이터 변경의 알림은 그 실행(runId)에 잇는다: 다시 누른 실행의 판단이 처음 실행에 붙지 않게(QA 11-19)", async () => {
  const tables = baseTables();
  tables.changes[0].is_simulated = true;
  tables.profiles[1].is_demo = true;
  await createAlertsForChange(fakeDb(tables).db, { ...input, runId: "sim-run-2" });

  assert.deepEqual(tables.alerts.map((a) => [a.user_id, a.run_id]), [["user-b", "sim-run-2"]]);
});

test("진짜 변경은 runId가 있어도 originRun 본인 줄 말고는 run_id를 비운다(불변 5)", async () => {
  const { db, tables } = fakeDb(baseTables());

  await createAlertsForChange(db, { ...input, runId: "osv-run" });

  assert.deepEqual(tables.alerts.map((a) => "run_id" in a), [false, false]);
});

test("originRun이 없으면 알림 줄에 run_id 칸을 보내지 않는다(마이그레이션 전에도 다른 경로가 동작)", async () => {
  const { db, tables } = fakeDb(baseTables());

  await createAlertsForChange(db, input);

  assert.deepEqual(tables.alerts.map((a) => "run_id" in a), [false, false]);
});

// ── 대응안 초안 연결(PRD-F15, SPEC-9, flow `save_change → summarize → notify`)
const fakeAi: AiClient = { complete: async () => ({ text: "{}" }) };

test("보안 알림은 만들기 전에 대응안 초안을 한 번 부른다: 변경 id·실행 id·Claude 클라이언트를 넘기고, 그때까지 알림은 아직 안 쓴다", async () => {
  const { db, writes } = fakeDb(baseTables());
  const seen: { changeId: string; runId: string | undefined; ai: AiClient | null; writesSoFar: number }[] = [];
  const deps: AlertDeps = {
    aiClient: () => fakeAi,
    generateDraft: async (_db, ai, i) => (seen.push({ changeId: i.changeId, runId: i.runId, ai, writesSoFar: writes.length }), { status: "created" }),
  };
  const created = await createWithDeps(db, { ...input, runId: "run-9" }, deps);
  assert.deepEqual(seen, [{ changeId: "change-1", runId: "run-9", ai: fakeAi, writesSoFar: 0 }]);
  assert.equal(created, 2);
  assert.equal(writes.length, 1); // 알림 쓰기는 초안 뒤
});

test("초안이 실패해도(키 없음 포함) 알림은 그대로 만들고 notify 단계도 남긴다 — 실패는 summarize 단계에 남는다(draft.ts)", async () => {
  const { db, inserts } = fakeDb(baseTables());
  const deps: AlertDeps = { aiClient: () => null, generateDraft: async () => ({ status: "failed", reason: "not_configured" }) };
  assert.equal(await createWithDeps(db, { ...input, runId: "run-1" }, deps), 2);
  assert.deepEqual(inserts.map((i) => [i.table, i.row.step_name]), [["run_steps", "notify"]]);
});

test("실행 id가 없으면 초안도 실행 id 없이 부른다. 한도로 건너뛴 초안도 알림 만들기를 막지 않는다", async () => {
  const { db } = fakeDb(baseTables());
  const runIds: (string | undefined)[] = [];
  const deps: AlertDeps = { aiClient: () => null, generateDraft: async (_db, _ai, i) => (runIds.push(i.runId), { status: "skipped", reason: "service_limit" }) };
  assert.equal(await createWithDeps(db, input, deps), 2);
  assert.deepEqual(runIds, [undefined]);
});

test("적용 기회 알림은 초안을 부르지 않는다(초안은 보안 변경만, SPEC-9)", async () => {
  const { db } = fakeDb(baseTables());
  const deps: AlertDeps = { aiClient: () => fakeAi, generateDraft: async () => { throw new Error("호출되면 안 됨"); } };
  // 이 가짜 표로 적용 기회가 끝까지 가는지는 상관없다: 초안을 부르면 위 오류가 나오므로, 나온 오류가 그것이 아니면 된다
  const outcome = await createWithDeps(db, { ...input, kind: "opportunity" }, deps).then(() => null, (e: Error) => e);
  assert.ok(outcome === null || !/호출되면 안 됨/.test(outcome.message));
});
