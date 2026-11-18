import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearSimulated, runSimulator, type SimulatorDeps } from "./simulator.ts";

type Call = { table: string; op: string; row?: Record<string, unknown>; filters: [string, string, unknown][]; single: boolean };
type Reply = { data?: unknown; error?: { message: string } };
type Responder = (call: Call) => Reply | undefined;

// 실제 DB 대신 "무엇을 어디에 어떤 조건으로 하려 했는지"만 모으는 가짜 클라이언트
function fakeDb(respond: Responder = () => undefined) {
  const calls: Call[] = [];
  const log: string[] = [];
  const defaults: Record<string, unknown> = { "runs:insert": { id: "run-1" }, "sources:upsert": { id: "src-1" }, "technologies:insert": { id: "tech-1" }, "observations:insert": { id: "obs-1" } };
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [], single: false };
      const b: Record<string, unknown> = {};
      const mark = (op: string) => (row?: Record<string, unknown>) => { call.op = op; if (row) call.row = row; return b; };
      b.insert = mark("insert");
      b.upsert = mark("upsert");
      b.update = mark("update");
      b.delete = mark("delete");
      b.select = () => b;
      b.eq = (c: string, v: unknown) => (call.filters.push([c, "eq", v]), b);
      b.in = (c: string, v: unknown) => (call.filters.push([c, "in", v]), b);
      b.single = () => ((call.single = true), b);
      b.maybeSingle = () => ((call.single = true), b);
      b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
        calls.push(call);
        log.push(`${table}:${call.op}`);
        const reply = respond(call);
        const data = reply && "data" in reply ? reply.data : defaults[`${table}:${call.op}`] ?? null;
        return Promise.resolve({ data, error: reply?.error ?? null }).then(resolve, reject);
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls, log };
}

function fakeDeps(opts: { created?: boolean; alerts?: number; saveError?: string; respond?: Responder } = {}) {
  const { db, calls, log } = fakeDb(opts.respond);
  const saved: Record<string, any>[] = [];
  const alertInputs: Record<string, any>[] = [];
  const deps: SimulatorDeps = {
    db,
    async saveChange(_db, change) {
      log.push("saveChange");
      saved.push(change);
      if (opts.saveError) throw new Error(opts.saveError);
      return { id: "chg-1", created: opts.created ?? true };
    },
    async createAlertsForChange(_db, input) {
      log.push("createAlerts");
      alertInputs.push(input);
      return opts.alerts ?? 1;
    },
  };
  return { deps, calls, log, saved, alertInputs };
}

const stepNames = (calls: Call[]) => calls.filter((c) => c.table === "run_steps").map((c) => `${c.row?.step_name}:${c.row?.status}`);

test("runSimulator: 정해진 순서로 쓰고, 단계 이름은 흐름 상자 id와 같다", async () => {
  const { deps, calls, log } = fakeDeps();
  const result = await runSimulator(deps, { adminId: "admin-1" });
  const order = log.filter((l) => !l.startsWith("run_steps"));
  assert.deepEqual(order, ["runs:insert", "sources:upsert", "technologies:select", "technologies:insert", "observations:insert", "saveChange", "createAlerts", "runs:update"]);
  assert.deepEqual(stepNames(calls), ["normalize:succeeded", "compare:succeeded", "grade:succeeded", "is_event:succeeded", "save_change:succeeded", "human_judgment:awaiting_judgment"]);
  assert.equal(calls[0].row?.trigger, "simulator");
  assert.equal(calls[0].row?.started_by, "admin-1");
  assert.equal(calls.at(-1)?.row?.status, "succeeded");
  assert.equal(result.runId, "run-1");
  assert.equal(result.alertsCreated, 1);
});

test("runSimulator: 가짜 표시와 G1 값이 붙는다", async () => {
  const { deps, calls, saved, alertInputs } = fakeDeps();
  await runSimulator(deps, { adminId: "a" });
  assert.equal(calls.find((c) => c.table === "technologies" && c.op === "insert")?.row?.is_simulated, true);
  assert.equal(calls.find((c) => c.table === "observations")?.row?.is_simulated, true);
  assert.equal(calls.find((c) => c.table === "sources")?.row?.enabled, false);
  assert.equal(saved[0].isSimulated, true);
  assert.equal(saved[0].kind, "grade_to_danger");
  assert.equal(saved[0].causeId, "GHSA-6xpm-ggf7-wc3p");
  assert.deepEqual(saved[0].tech, { key: "npm:mcp-remote", version: "0.1.15" });
  assert.equal(alertInputs[0].runId, "run-1");
  assert.equal(alertInputs[0].changeId, "chg-1");
  const isEvent = calls.find((c) => c.table === "run_steps" && c.row?.step_name === "is_event");
  assert.deepEqual(isEvent?.row?.branch_counts, { 사건: 1, "변화 없음": 0, "수집 오류": 0 });
});

test("runSimulator: 기술이 이미 있으면 새로 만들지 않고 건드리지 않는다", async () => {
  const respond: Responder = (c) => (c.table === "technologies" && c.op === "select" ? { data: { id: "tech-old" } } : undefined);
  const { deps, calls, saved } = fakeDeps({ respond });
  await runSimulator(deps, { adminId: "a" });
  assert.equal(calls.some((c) => c.table === "technologies" && c.op !== "select"), false);
  assert.equal(saved[0].techId, "tech-old");
});

test("runSimulator: 같은 변경을 또 만들면 '이미 있음'으로 남고, 알림 0건이면 이유를 돌려준다", async () => {
  const { deps, calls } = fakeDeps({ created: false, alerts: 0 });
  const result = await runSimulator(deps, { adminId: "a" });
  assert.equal(result.changeCreated, false);
  assert.equal(result.alertsCreated, 0);
  assert.match(result.note, /알림 0건/);
  assert.match(result.note, /시연 계정/);
  const save = calls.find((c) => c.table === "run_steps" && c.row?.step_name === "save_change");
  assert.match(String(save?.row?.output_summary), /이미 있는 변경/);
  assert.equal(stepNames(calls).some((s) => s.startsWith("human_judgment")), false);
});

test("runSimulator: 중간에 실패하면 그 단계를 failed로 남기고 실행도 failed로 닫은 뒤 원래 오류를 던진다", async () => {
  const { deps, calls } = fakeDeps({ saveError: "변경을 저장하지 못함: 연결 끊김" });
  await assert.rejects(() => runSimulator(deps, { adminId: "a" }), /연결 끊김/);
  const names = stepNames(calls);
  assert.equal(names.at(-1), "save_change:failed");
  assert.equal(calls.at(-1)?.table, "runs");
  assert.equal(calls.at(-1)?.row?.status, "failed");
});

test("runSimulator: 수집 자료 저장이 실패하면 compare 단계가 failed", async () => {
  const respond: Responder = (c) => (c.table === "observations" ? { error: { message: "쓰기 거부" } } : undefined);
  const { deps, calls } = fakeDeps({ respond });
  await assert.rejects(() => runSimulator(deps, { adminId: "a" }), /쓰기 거부/);
  assert.equal(stepNames(calls).at(-1), "compare:failed");
});

test("runSimulator: 알림 단계 실패는 알림 함수가 이미 기록하므로 notify를 또 쓰지 않는다", async () => {
  const { deps, calls } = fakeDeps();
  deps.createAlertsForChange = async () => { throw new Error("알림 저장 실패"); };
  await assert.rejects(() => runSimulator(deps, { adminId: "a" }), /알림 저장 실패/);
  assert.equal(stepNames(calls).some((s) => s.startsWith("notify")), false);
  assert.equal(calls.at(-1)?.row?.status, "failed");
});

function clearResponder(extra: Responder = () => undefined): Responder {
  return (c) => {
    const given = extra(c);
    if (given) return given;
    if (c.table === "changes" && c.op === "select") return { data: [{ id: "chg-1" }] };
    if (c.table === "alerts" && c.op === "select") return { data: [{ id: "al-1" }, { id: "al-2" }] };
    if (c.op === "delete") return { data: [{ id: "x" }] };
    if (c.table === "technologies" && c.op === "select") return { data: [{ id: "t-1" }, { id: "t-2" }] };
    if (c.table === "my_technologies") return { data: [{ tech_id: "t-2" }] };
    return undefined;
  };
}

test("clearSimulated: 외래키 순서로 지우고 바꾼 기록을 남긴다", async () => {
  const { db, calls, log } = fakeDb(clearResponder());
  const result = await clearSimulated({ db }, { adminId: "admin-1" });
  const deletes = log.filter((l) => l.endsWith(":delete"));
  assert.deepEqual(deletes, ["scenarios:delete", "judgments:delete", "alerts:delete", "changes:delete", "observations:delete", "technologies:delete"]);
  assert.equal(log.at(-1), "audit_logs:insert");
  const audit = calls.at(-1)?.row;
  assert.equal(audit?.actor_role, "admin");
  assert.equal(audit?.action, "simulator_clear");
  assert.equal(audit?.target_table, "changes");
  assert.equal(audit?.actor_id, "admin-1");
  assert.match(String(audit?.reason), /변경 1/);
  assert.equal(result.changes, 1);
  assert.equal(result.keptTechnologies, 1);
});

test("clearSimulated: 가짜 표시 조건이 항상 붙고, 실행 기록은 건드리지 않는다", async () => {
  const { db, calls } = fakeDb(clearResponder());
  await clearSimulated({ db }, { adminId: "a" });
  const hasFake = (c: Call) => c.filters.some(([col, op, val]) => col === "is_simulated" && op === "eq" && val === true);
  for (const table of ["changes", "observations", "technologies"]) {
    for (const c of calls.filter((x) => x.table === table && x.op === "delete")) assert.ok(hasFake(c), `${table} 삭제에 is_simulated 조건이 없음`);
  }
  // 알림·판단·시나리오는 가짜 변경에서 찾은 알림 id로만 지운다
  for (const table of ["scenarios", "judgments"]) {
    const del = calls.find((x) => x.table === table && x.op === "delete");
    assert.deepEqual(del?.filters, [["alert_id", "in", ["al-1", "al-2"]]]);
  }
  assert.ok(calls.find((x) => x.table === "alerts" && x.op === "select")?.filters.some(([c, , v]) => c === "change_id" && Array.isArray(v) && v[0] === "chg-1"));
  assert.equal(calls.some((c) => ["runs", "run_steps"].includes(c.table)), false);
});

test("clearSimulated: 내 기술이 쓰는 가짜 기술은 남긴다", async () => {
  const { db, calls } = fakeDb(clearResponder());
  await clearSimulated({ db }, { adminId: "a" });
  const del = calls.find((x) => x.table === "technologies" && x.op === "delete");
  assert.deepEqual(del?.filters.find(([c]) => c === "id"), ["id", "in", ["t-1"]]);
});

test("clearSimulated: 지울 것이 없으면 빈 목록으로 DB를 부르지 않고 0건을 기록한다", async () => {
  const { db, calls } = fakeDb((c) => (c.op === "delete" || c.op === "select" ? { data: [] } : undefined));
  const result = await clearSimulated({ db }, { adminId: "a" });
  assert.equal(result.changes, 0);
  assert.equal(calls.some((c) => c.table === "scenarios" || c.table === "judgments" || c.table === "alerts"), false);
  assert.equal(calls.some((c) => c.table === "my_technologies"), false);
  assert.match(String(calls.at(-1)?.row?.reason), /변경 0/);
});

test("clearSimulated: 중간에 실패하면 던지고 바꾼 기록은 남기지 않는다", async () => {
  const { db, calls } = fakeDb(clearResponder((c) => (c.table === "alerts" && c.op === "delete" ? { error: { message: "외래키 위반" } } : undefined)));
  await assert.rejects(() => clearSimulated({ db }, { adminId: "a" }), /외래키 위반/);
  assert.equal(calls.some((c) => c.table === "audit_logs"), false);
  assert.equal(calls.some((c) => c.table === "changes" && c.op === "delete"), false);
});
