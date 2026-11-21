import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decideOpportunityAlerts } from "../alerts/decide-opportunity-alerts.ts";
import { clearSimulated, type SimulatorDeps } from "./simulator.ts";
import { pickDemoTech, runOpportunitySimulator } from "./simulator-opportunity.ts";

type Call = { table: string; op: string; row?: Record<string, unknown>; options?: unknown; filters: [string, string, unknown][] };
type Reply = { data?: unknown; error?: { message: string } };

// 실제 DB 대신 "어느 표에 무엇을 어떤 조건으로" 했는지 모으는 가짜 클라이언트
function fakeDb(respond: (c: Call) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  const log: string[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      const b: Record<string, unknown> = {};
      const mark = (op: string) => (row?: Record<string, unknown>, options?: unknown) => { call.op = op; if (row) call.row = row; call.options = options; return b; };
      b.insert = mark("insert");
      b.upsert = mark("upsert");
      b.update = mark("update");
      b.delete = mark("delete");
      b.select = () => b;
      for (const f of ["eq", "in", "is"]) b[f] = (c: string, v: unknown) => (call.filters.push([c, f, v]), b);
      b.single = () => b;
      b.maybeSingle = () => b;
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        calls.push(call);
        log.push(`${table}:${call.op}`);
        const r = respond(call);
        return Promise.resolve({ data: r && "data" in r ? r.data : null, error: r?.error ?? null }).then(resolve, reject);
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls, log };
}

const DEMO_TECH = "11111111-0000-0000-0000-000000000000";
const NEW_TECH = "22222222-0000-0000-0000-000000000000";

function happy(extra: (c: Call) => Reply | undefined = () => undefined) {
  return (c: Call): Reply | undefined => {
    const given = extra(c);
    if (given) return given;
    if (c.table === "profiles") return { data: [{ id: "demo-1" }] };
    if (c.table === "my_technologies") return { data: [
      { tech_id: "fake-x", technologies: { tech_key: "sim:other", is_simulated: true } },
      { tech_id: DEMO_TECH, technologies: { tech_key: "npm:mcp-remote", is_simulated: false } },
    ] };
    if (c.table === "runs" && c.op === "insert") return { data: { id: "run-1" } };
    if (c.table === "sources") return { data: { id: "src-1" } };
    if (c.table === "technologies" && c.op === "upsert") return { data: [{ id: NEW_TECH }] };
    if (c.table === "observations") return { data: { id: "obs-1" } };
    return undefined;
  };
}

function deps(respond: (c: Call) => Reply | undefined, opts: { created?: boolean; alerts?: number } = {}) {
  const { db, calls, log } = fakeDb(respond);
  const saved: Record<string, any>[] = [];
  const alertInputs: Record<string, any>[] = [];
  const d: SimulatorDeps = {
    db,
    saveChange: async (_db, c) => (log.push("saveChange"), saved.push(c), { id: "chg-1", created: opts.created ?? true }),
    createAlertsForChange: async (_db, input) => (log.push("createAlerts"), alertInputs.push(input), opts.alerts ?? 1),
  };
  return { d, calls, log, saved, alertInputs };
}

const steps = (calls: Call[]) => calls.filter((c) => c.table === "run_steps").map((c) => `${c.row?.step_name}:${c.row?.status}`);

test("시연 계정 기술 고르기: 가짜 기술은 빼고 기술 키 이름순 첫째", async () => {
  const { db } = fakeDb(happy());
  assert.deepEqual(await pickDemoTech(db), { techId: DEMO_TECH, techKey: "npm:mcp-remote" });
});

test("시연 계정에 기술이 없으면 실행 기록을 만들지 않고 이유만 돌려준다", async () => {
  const { d, calls } = deps(happy((c) => (c.table === "my_technologies" ? { data: [] } : undefined)));
  const r = await runOpportunitySimulator(d, { adminId: "admin-1" });
  assert.equal(r.started, false);
  assert.equal(calls.some((c) => c.table === "runs"), false);
});

test("순서: 실행 시작 → 출처 → 가짜 새 기술 → 확정된 관계 → 수집 자료 → 변경(same_role_new) → 적용 기회 알림 → 판단 대기 → 닫기", async () => {
  const { d, calls, log, saved, alertInputs } = deps(happy());
  const r = await runOpportunitySimulator(d, { adminId: "admin-1" });
  const order = log.filter((l) => !l.startsWith("run_steps") && !l.startsWith("profiles") && !l.startsWith("my_technologies"));
  assert.deepEqual(order, ["runs:insert", "sources:upsert", "technologies:upsert", "tech_relations:upsert", "observations:insert", "saveChange", "createAlerts", "runs:update"]);
  assert.deepEqual(steps(calls), ["normalize:succeeded", "compare:succeeded", "grade:succeeded", "is_event:succeeded", "save_change:succeeded", "human_judgment:awaiting_judgment"]);
  assert.equal(calls.find((c) => c.table === "runs" && c.op === "insert")!.row?.trigger, "simulator");
  assert.equal(saved[0].kind, "same_role_new");
  assert.equal(saved[0].isSimulated, true);
  assert.match(saved[0].causeId, /^sim:/);
  assert.deepEqual(alertInputs[0], { changeId: "chg-1", techId: NEW_TECH, kind: "opportunity", runId: "run-1" });
  assert.ok(r.started && r.alertsCreated === 1);
});

test("가짜 표시와 SPEC-3.2 조건: 관계는 확정(관리자·시각), 새 기술은 위험 아님, 둘 다 is_simulated", async () => {
  const { d, calls } = deps(happy());
  await runOpportunitySimulator(d, { adminId: "admin-1" });
  const tech = calls.find((c) => c.table === "technologies" && c.op === "upsert")!.row!;
  assert.equal(tech.is_simulated, true);
  assert.notEqual(tech.grade, "danger");
  assert.match(String(tech.tech_key), /^sim:/);
  const rel = calls.find((c) => c.table === "tech_relations")!.row!;
  assert.equal(rel.status, "confirmed");
  assert.equal(rel.confirmed_by, "admin-1");
  assert.ok(rel.confirmed_at);
  assert.equal(rel.is_simulated, true);
  assert.ok(String(rel.tech_a) < String(rel.tech_b), "작은 id가 a(DB 제약)");
  assert.deepEqual(calls.find((c) => c.table === "tech_relations")!.options, { onConflict: "tech_a,tech_b,kind", ignoreDuplicates: true });
  assert.equal(calls.find((c) => c.table === "observations")!.row!.is_simulated, true);
});

test("이렇게 만든 값은 적용 기회 규칙(B의 decideOpportunityAlerts)을 우회 없이 통과한다", async () => {
  const { d, calls } = deps(happy());
  await runOpportunitySimulator(d, { adminId: "admin-1" });
  const rel = calls.find((c) => c.table === "tech_relations")!.row!;
  const tech = calls.find((c) => c.table === "technologies" && c.op === "upsert")!.row!;
  const alerts = decideOpportunityAlerts({
    change: { id: "chg-1", isSimulated: true },
    newTech: { id: NEW_TECH, techKey: String(tech.tech_key), grade: String(tech.grade), status: "active", createdAt: new Date().toISOString(), stars: null, flagged: false }, // 가짜 기술은 별 정보가 없다(조건 4는 시뮬레이터에 안 걸린다)
    relations: [{ otherTechId: DEMO_TECH, status: rel.status as "confirmed", confirmedAt: String(rel.confirmed_at) }],
    usages: [
      { userId: "demo-1", myTechnologyId: "m1", techId: DEMO_TECH, techKey: "npm:mcp-remote", isDemo: true, hidden: false, archived: false, registeredAt: "2026-11-17T00:00:00Z" },
      { userId: "real-1", myTechnologyId: "m2", techId: DEMO_TECH, techKey: "npm:mcp-remote", isDemo: false, hidden: false, archived: false, registeredAt: "2026-11-17T00:00:00Z" },
    ],
    existingAlertKeys: new Set(),
  });
  assert.deepEqual(alerts.map((a) => a.userId), ["demo-1"]); // 시연 계정에만
});

test("같은 걸 또 누르면 변경은 그대로 1건('이미 있음'), 알림 0건이면 이유를 돌려준다", async () => {
  const { d, calls } = deps(happy((c) => (c.table === "changes" ? { data: { is_simulated: true } } : undefined)), { created: false, alerts: 0 });
  const r = await runOpportunitySimulator(d, { adminId: "a" });
  assert.ok(r.started && r.changeCreated === false && r.alertsCreated === 0);
  assert.match(r.started ? r.note : "", /알림 0건/);
  assert.match(String(calls.find((c) => c.row?.step_name === "save_change")!.row!.output_summary), /이미 있는 변경/);
});

test("이미 있던 변경이 진짜 변경이면 알림을 붙이지 않고 멈춘다", async () => {
  const { d, calls, alertInputs } = deps(happy((c) => (c.table === "changes" ? { data: { is_simulated: false } } : undefined)), { created: false });
  await assert.rejects(() => runOpportunitySimulator(d, { adminId: "a" }), /진짜 변경/);
  assert.equal(alertInputs.length, 0);
  assert.equal(calls.filter((c) => c.table === "runs").at(-1)!.row!.status, "failed");
});

test("가짜 새 기술 키가 진짜 기술과 겹치면 멈춘다", async () => {
  const respond = happy((c) => {
    if (c.table === "technologies" && c.op === "upsert") return { data: [] };
    if (c.table === "technologies" && c.op === "select") return { data: { id: "real", is_simulated: false } };
    return undefined;
  });
  const { d } = deps(respond);
  await assert.rejects(() => runOpportunitySimulator(d, { adminId: "a" }), /진짜 기술과 겹침/);
});

test("시뮬레이터 지우기: 같은 역할 관계(가짜 표시)를 기술보다 먼저 지우고, 항상 is_simulated 조건이 붙는다", async () => {
  const { db, calls, log } = fakeDb((c) => {
    if (c.table === "changes" && c.op === "select") return { data: [{ id: "chg-1" }] };
    if (c.table === "alerts" && c.op === "select") return { data: [{ id: "al-1" }] };
    if (c.op === "delete") return { data: [{ id: "x" }] };
    if (c.table === "technologies" && c.op === "select") return { data: [{ id: NEW_TECH }] };
    return { data: [] };
  });
  const r = await clearSimulated({ db }, { adminId: "admin-1" });
  const deletes = log.filter((l) => l.endsWith(":delete"));
  assert.ok(deletes.indexOf("tech_relations:delete") > deletes.indexOf("observations:delete"));
  assert.ok(deletes.indexOf("tech_relations:delete") < deletes.indexOf("technologies:delete"));
  const relDelete = calls.find((c) => c.table === "tech_relations" && c.op === "delete")!;
  assert.deepEqual(relDelete.filters, [["is_simulated", "eq", true]]);
  assert.equal(r.relations, 1);
  assert.match(String(calls.at(-1)!.row!.reason), /같은 역할 관계 1/);
});
