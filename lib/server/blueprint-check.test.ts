import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { COMMAND_NOTICE } from "../ai/parse-scenario-response.ts";
import { countChecksToday, generateBlueprintCheck, loadBlueprintFacts, readLatestCheck } from "./blueprint-check.ts";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

// 메모리 표로 "무엇을 읽고 무엇을 쓰려 했는지"를 모으는 가짜 클라이언트. errors: "read:표" · "insert:표" · "update:표"
// uniqueGenerating: 같은 확정본에 만드는 중 줄이 이미 있으면 넣을 때 23505(부분 유일 색인 흉내)
function fakeDb(tables: Tables, errors: Record<string, string> = {}, uniqueGenerating = false) {
  const writes: { table: string; op: "insert" | "update"; value: Row }[] = [];
  let counter = 0;
  const fail = (key: string) => (errors[key] ? { data: null, error: { message: errors[key] } } : null);
  const db = {
    from(table: string) {
      return {
        select() {
          let rows = [...(tables[table] ?? [])];
          const q: any = {
            eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return q; },
            in(col: string, vals: unknown[]) { rows = rows.filter((r) => vals.includes(r[col])); return q; },
            gte(col: string, val: string) { rows = rows.filter((r) => r[col] >= val); return q; },
            order() { return q; },
            limit(n: number) { rows = rows.slice(0, n); return q; },
            maybeSingle: () => Promise.resolve(fail(`read:${table}`) ?? { data: rows[0] ?? null, error: null }),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(fail(`read:${table}`) ?? { data: rows, error: null }).then(resolve),
          };
          return q;
        },
        insert(value: Row) {
          writes.push({ table, op: "insert", value });
          const dup = uniqueGenerating && table === "blueprint_checks" && (tables[table] ?? []).some((r) => r.blueprint_id === value.blueprint_id && r.status === "generating");
          const error = dup ? { message: "duplicate key value violates unique constraint", code: "23505" } : fail(`insert:${table}`)?.error ?? null;
          const id = `${table}-${++counter}`;
          if (!error) (tables[table] ??= []).push({ id, status: table === "blueprint_checks" ? "generating" : undefined, created_at: "2026-11-22T04:00:00.000Z", ...value });
          const promise: any = Promise.resolve(error ? { data: null, error } : { data: [{ id }], error: null });
          promise.select = () => ({ single: () => Promise.resolve(error ? { data: null, error } : { data: { id }, error: null }) });
          return promise;
        },
        update(patch: Row) {
          writes.push({ table, op: "update", value: patch });
          const error = fail(`update:${table}`);
          let rows = [...(tables[table] ?? [])];
          const q: any = {
            eq(col: string, val: unknown) { rows = rows.filter((r) => r[col] === val); return q; },
            lt(col: string, val: string) { rows = rows.filter((r) => r[col] < val); return q; },
            then: (resolve: (v: unknown) => unknown) => {
              if (!error) for (const r of rows) Object.assign(r, patch);
              return Promise.resolve(error ?? { data: null, error: null }).then(resolve);
            },
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, writes, tables };
}

const NOW = new Date("2026-11-22T05:00:00Z"); // 한국 시간 14시: 오늘의 시작은 2026-11-21T15:00:00.000Z
const TODAY = "2026-11-22T02:00:00.000Z";
const YESTERDAY = "2026-11-21T14:00:00.000Z";
const BP = "11111111-1111-4111-8111-111111111111";
const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";
const FAKE_GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

const board = () => [[{ name: "기획", techs: [] }], [{ name: "개발", techs: [{ id: T1, name: "기술A" }, { id: T2, name: "기술B" }] }]];
const techRow = (id: string, name: string, over: Row = {}): Row => ({
  id, display_name: name, tech_key: `npm:${name}`, type: "sdk", grade: "pass", grade_reason: null,
  last_activity_at: "2026-11-10T00:00:00Z", last_activity_kind: "commit", collect_error_kind: null, repo_url: `https://github.com/acme/${name}`, ...over,
});
function tables(over: Tables = {}): Tables {
  return {
    blueprints: [{ id: BP, user_id: "u1", name: "내 청사진", board: board() }],
    technologies: [techRow(T1, "a", { grade: "danger", grade_reason: "심각한 취약점이 있어요" }), techRow(T2, "b")],
    tech_relations: [],
    blueprint_checks: [],
    ai_calls: [],
    ...over,
  };
}

const goodAnswer = JSON.stringify({
  steps: ["기술A를 빼거나 고친 버전으로 바꿔 보세요."],
  risks: ["기술B의 활동은 확인했지만 나머지는 전부 확인한 것은 아니에요."],
  sources: ["https://github.com/acme/a", "https://made-up.example/x"],
});
function fakeAi(reply: string | Error = goodAnswer) {
  const seen: { system: string; user: string }[] = [];
  const ai: AiClient = {
    async complete(prompt) {
      seen.push(prompt);
      if (reply instanceof Error) throw reply;
      return { text: reply, tokensIn: 100, tokensOut: 50 };
    },
  };
  return { ai, seen };
}
const run = (user: ReturnType<typeof fakeDb>, service: ReturnType<typeof fakeDb>, ai: AiClient | null, over = {}) =>
  generateBlueprintCheck({ userDb: user.db, serviceDb: service.db, ai }, { blueprintId: BP, userId: "u1", now: NOW, ...over });
const wrote = (w: ReturnType<typeof fakeDb>["writes"], table: string, op: "insert" | "update") => w.filter((x) => x.table === table && x.op === op).map((x) => x.value);

test("점검: 요청 줄(두 칸만) → 코드 사실 + Claude의 제안 · 주의를 저장하고 호출을 기록한다, 지어낸 출처는 버린다", async () => {
  const user = fakeDb(tables());
  const service = fakeDb(tables());
  const { ai, seen } = fakeAi();

  const result = await run(user, service, ai);

  assert.deepEqual(result, { status: "created", checkId: "blueprint_checks-1" });
  assert.deepEqual(wrote(user.writes, "blueprint_checks", "insert"), [{ blueprint_id: BP, requested_by: "u1" }]);
  assert.match(seen[0].user, /기술A/);
  assert.match(seen[0].user, /위험 등급이에요: 심각한 취약점이 있어요/, "코드가 찾은 사실이 재료로 간다");
  const saved = wrote(service.writes, "blueprint_checks", "update").find((v) => v.status === "done")!;
  assert.ok(saved);
  assert.match(saved.input_hash, /^[0-9a-f]{64}$/);
  assert.deepEqual(saved.body.suggestions, ["기술A를 빼거나 고친 버전으로 바꿔 보세요."]);
  assert.equal(saved.body.facts[0].kind, "danger");
  assert.deepEqual(Object.keys(saved.body.facts[0]).sort(), ["kind", "severity", "source", "techIds", "text"], "단계 id는 싣지 않는다");
  assert.deepEqual(saved.sources, ["https://github.com/acme/a"]);
  const call = wrote(service.writes, "ai_calls", "insert")[0];
  assert.deepEqual([call.purpose, call.user_id, call.status, call.tokens_in, call.tokens_out, call.input_hash], ["blueprint_check", "u1", "succeeded", 100, 50, saved.input_hash]);
});

test("점검: 같은 확정본을 같은 재료로 다시 누르면 새로 부르지 않고 이전 결과를 다시 쓴다(한도도 안 씀)", async () => {
  const t = tables();
  const user = fakeDb(t);
  const service = fakeDb(t);
  const first = fakeAi();
  assert.equal((await run(user, service, first.ai)).status, "created");

  const second = fakeAi();
  const again = await run(user, service, second.ai);

  assert.deepEqual(again, { status: "reused", checkId: "blueprint_checks-1" });
  assert.equal(second.seen.length, 0);
  assert.equal(wrote(user.writes, "blueprint_checks", "insert").length, 1);
  assert.equal(wrote(service.writes, "ai_calls", "insert").length, 1);
});

test("점검: 재료가 바뀌면(기술 등급이 달라짐) 새로 부른다", async () => {
  const t = tables();
  const user = fakeDb(t);
  const service = fakeDb(t);
  await run(user, service, fakeAi().ai);
  t.technologies[1] = techRow(T2, "b", { grade: "caution", grade_reason: "라이선스가 없어요" });
  const second = fakeAi();
  assert.equal((await run(user, service, second.ai)).status, "created");
  assert.equal(second.seen.length, 1);
});

test("점검: 같은 역할로 확정된 두 기술이 한 청사진에 있으면 겹침 사실이 간다(시뮬레이터 것은 DB가 거름)", async () => {
  const t = tables({ tech_relations: [{ tech_a: T1, tech_b: T2, kind: "same_role", status: "confirmed", is_simulated: false, quote: "둘 다 같은 일", confirmed_at: "2026-11-12T00:00:00Z" }] });
  const loaded = await loadBlueprintFacts({ userDb: fakeDb(t).db, serviceDb: fakeDb(t).db }, BP, "u1", NOW);
  assert.deepEqual(loaded!.facts.map((f) => f.kind), ["danger", "overlap", "empty_stage"]);
  assert.match(loaded!.facts[1].text, /"a"과\(와\) "b"는 같은 역할/);
  const simulated = tables({ tech_relations: [{ tech_a: T1, tech_b: T2, kind: "same_role", status: "confirmed", is_simulated: true, quote: null, confirmed_at: "2026-11-12T00:00:00Z" }] });
  assert.deepEqual((await loadBlueprintFacts({ userDb: fakeDb(simulated).db, serviceDb: fakeDb(simulated).db }, BP, "u1", NOW))!.facts.map((f) => f.kind), ["danger", "empty_stage"]);
});

test("점검: 사용자당 하루 3번(한국 시간 기준) — 어제 것은 안 센다", async () => {
  const mine = (n: number, at: string) => Array.from({ length: n }, (_, i) => ({ id: `c${at}${i}`, requested_by: "u1", blueprint_id: BP, status: "failed", created_at: at }));
  const full = fakeDb(tables({ blueprint_checks: [...mine(3, TODAY), ...mine(5, YESTERDAY)] }));
  const ai = fakeAi();
  assert.deepEqual(await run(full, fakeDb(tables()), ai.ai), { status: "refused", reason: "user_limit" });
  assert.equal(ai.seen.length, 0);
  assert.equal(wrote(full.writes, "blueprint_checks", "insert").length, 0);
  const two = fakeDb(tables({ blueprint_checks: [...mine(2, TODAY), ...mine(5, YESTERDAY)] }));
  assert.equal((await run(two, fakeDb(tables()), fakeAi().ai)).status, "created");
  assert.equal(await countChecksToday(two.db, "u1", NOW), 3);
});

test("점검: 서비스 전체 하루 200번이 차면 막는다", async () => {
  const calls = Array.from({ length: 200 }, (_, i) => ({ id: `a${i}`, created_at: TODAY }));
  const ai = fakeAi();
  assert.deepEqual(await run(fakeDb(tables()), fakeDb(tables({ ai_calls: calls })), ai.ai), { status: "refused", reason: "service_limit" });
  assert.equal(ai.seen.length, 0);
});

test("점검: 내 것이 아니거나 없거나 id 모양이 틀리면 not_found — 읽지도 부르지도 않는다", async () => {
  const ai = fakeAi();
  const other = fakeDb(tables({ blueprints: [{ id: BP, user_id: "u2", name: "남의 것", board: board() }] }));
  assert.deepEqual(await run(other, fakeDb(tables()), ai.ai), { status: "refused", reason: "not_found" });
  assert.deepEqual(await run(fakeDb(tables({ blueprints: [] })), fakeDb(tables()), ai.ai), { status: "refused", reason: "not_found" });
  assert.deepEqual(await run(fakeDb(tables()), fakeDb(tables()), ai.ai, { blueprintId: "x'; drop table" }), { status: "refused", reason: "not_found" });
  assert.equal(ai.seen.length, 0);
});

test("점검: 이미 만드는 중이면(부분 유일 색인) in_progress — Claude를 두 번 부르지 않는다", async () => {
  const user = fakeDb(tables({ blueprint_checks: [{ id: "c0", requested_by: "u1", blueprint_id: BP, status: "generating", created_at: TODAY }] }), {}, true);
  const ai = fakeAi();
  assert.deepEqual(await run(user, fakeDb(tables()), ai.ai), { status: "refused", reason: "in_progress" });
  assert.equal(ai.seen.length, 0);
});

test("점검: 10분 넘게 끊긴 '만드는 중' 줄은 실패로 닫고 새로 만든다", async () => {
  const generating = (created_at: string) => ({ id: "c0", requested_by: "u1", blueprint_id: BP, status: "generating", created_at });
  const t = tables({ blueprint_checks: [generating("2026-11-22T04:30:00.000Z")] }); // 30분 전
  const user = fakeDb(t, {}, true);
  const service = fakeDb(t);
  const result = await run(user, service, fakeAi().ai);
  assert.equal(result.status, "created");
  assert.equal(t.blueprint_checks.find((r) => r.id === "c0")!.status, "failed");
  const fresh = tables({ blueprint_checks: [generating("2026-11-22T04:55:00.000Z")] }); // 5분 전: 아직 진행 중
  assert.equal((await run(fakeDb(fresh, {}, true), fakeDb(fresh), fakeAi().ai)).status, "refused");
});

test("점검: Claude가 실패하면 줄을 실패로 닫고 호출을 failed로 기록한다(결과는 저장하지 않음)", async () => {
  const user = fakeDb(tables());
  const service = fakeDb(tables());
  const result = await run(user, service, fakeAi(new Error(`연결 오류 ${FAKE_GH}`)).ai);
  assert.equal(result.status, "failed");
  assert.ok(!JSON.stringify(result).includes(FAKE_GH), "비밀 키는 가린다");
  const updates = wrote(service.writes, "blueprint_checks", "update");
  assert.equal(updates.at(-1)!.status, "failed");
  assert.ok(!updates.some((v) => v.status === "done"));
  assert.equal(wrote(service.writes, "ai_calls", "insert")[0].status, "failed");
});

test("점검: 답이 JSON이 아니면 실패 — 토큰은 기록하고 결과는 저장하지 않는다", async () => {
  const service = fakeDb(tables());
  const result = await run(fakeDb(tables()), service, fakeAi("그냥 글입니다").ai);
  assert.equal(result.status, "failed");
  const call = wrote(service.writes, "ai_calls", "insert")[0];
  assert.deepEqual([call.status, call.tokens_in], ["failed", 100]);
  assert.ok(!wrote(service.writes, "blueprint_checks", "update").some((v) => v.status === "done"));
});

test("점검: 저장이 실패해도 호출은 기록한다(하루 한도에 세려고) · 설치 명령은 안내로 바뀐다", async () => {
  const service = fakeDb(tables(), { "update:blueprint_checks": "저장 실패" });
  const result = await run(fakeDb(tables()), service, fakeAi().ai);
  assert.equal(result.status, "failed");
  assert.deepEqual(wrote(service.writes, "ai_calls", "insert").map((v) => [v.status, v.tokens_out]), [["failed", 50]]);
  const cmd = fakeDb(tables());
  const ok = await run(fakeDb(tables()), cmd, fakeAi(JSON.stringify({ steps: ["npm install foo 로 설치하세요"], risks: ["없어요"], sources: [] })).ai);
  assert.equal(ok.status, "created");
  assert.equal(wrote(cmd.writes, "blueprint_checks", "update").find((v) => v.status === "done")!.body.suggestions[0], COMMAND_NOTICE);
});

test("점검: 기술을 읽지 못하면 부르지 않고 요청 줄도 만들지 않는다(못 읽은 것을 '문제 없음'으로 만들지 않음, 불변 2)", async () => {
  const user = fakeDb(tables());
  const ai = fakeAi();
  const result = await run(user, fakeDb(tables(), { "read:technologies": "DB 연결 끊김" }), ai.ai);
  assert.equal(result.status, "failed");
  assert.match((result as { reason: string }).reason, /기술을 읽지 못함/);
  assert.equal(ai.seen.length, 0);
  assert.equal(wrote(user.writes, "blueprint_checks", "insert").length, 0);
});

test("점검: Claude 키가 없으면 만들지 않는다 · 저장된 판 모양이 틀리면 실패", async () => {
  const user = fakeDb(tables());
  assert.deepEqual(await run(user, fakeDb(tables()), null), { status: "refused", reason: "not_configured" });
  assert.equal(wrote(user.writes, "blueprint_checks", "insert").length, 0);
  const broken = fakeDb(tables({ blueprints: [{ id: BP, user_id: "u1", name: "깨짐", board: "x" }] }));
  const r = await run(broken, fakeDb(tables()), fakeAi().ai);
  assert.equal(r.status, "failed");
  assert.match((r as { reason: string }).reason, /판 모양/);
});

test("점검 결과 읽기: 가장 최근 끝난 점검을 돌려주고, 없으면 null", async () => {
  assert.equal(await readLatestCheck(fakeDb(tables()).db, BP), null);
  const done = { id: "c1", blueprint_id: BP, status: "done", body: { facts: [], suggestions: ["a"], notes: ["b"] }, sources: ["https://example.com"], finished_at: TODAY };
  const latest = await readLatestCheck(fakeDb(tables({ blueprint_checks: [done, { ...done, id: "c2", status: "failed" }] })).db, BP);
  assert.deepEqual(latest, { id: "c1", body: done.body, sources: ["https://example.com"], finishedAt: TODAY });
});
