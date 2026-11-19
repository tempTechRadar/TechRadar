import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { COMMAND_NOTICE } from "../ai/parse-scenario-response.ts";
import { generateScenario } from "./scenario.ts";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

// 메모리 표로 "무엇을 읽고 무엇을 쓰려 했는지"를 모으는 가짜 클라이언트. errors: "read:표"·"insert:표"·"update:표"
function fakeDb(tables: Tables, errors: Record<string, string> = {}) {
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
            limit() { return q; },
            maybeSingle: () => Promise.resolve(fail(`read:${table}`) ?? { data: rows[0] ?? null, error: null }),
            single: () => Promise.resolve(fail(`read:${table}`) ?? (rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "한 줄이 아님" } })),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(fail(`read:${table}`) ?? { data: rows, error: null }).then(resolve),
          };
          return q;
        },
        insert(value: Row) {
          writes.push({ table, op: "insert", value });
          const error = fail(`insert:${table}`);
          const id = `${table}-${++counter}`;
          if (!error) (tables[table] ??= []).push({ id, ...value });
          const result = error ?? { data: [{ id }], error: null };
          const promise: any = Promise.resolve(result);
          promise.select = () => ({ single: () => Promise.resolve(error ?? { data: { id }, error: null }), then: promise.then.bind(promise) });
          return promise;
        },
        update(patch: Row) {
          writes.push({ table, op: "update", value: patch });
          const error = fail(`update:${table}`);
          return { eq: (col: string, val: unknown) => {
            if (!error) for (const row of tables[table] ?? []) if (row[col] === val) Object.assign(row, patch);
            return Promise.resolve(error ?? { data: null, error: null });
          } };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, writes, tables };
}

const NOW = new Date("2026-11-19T05:00:00Z"); // 한국 시간 14시: 오늘의 시작은 2026-11-18T15:00:00Z
const TODAY = "2026-11-19T02:00:00.000Z";
const YESTERDAY = "2026-11-18T14:00:00.000Z";
const FAKE_GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

const techRow = (id: string, name: string, over: Row = {}): Row => ({
  id, display_name: name, one_liner: `${name} 설명`, one_liner_source: "https://example.com/" + id, grade: "pass", grade_reason: null,
  grade_evidence: null, last_activity_at: null, last_activity_kind: null, repo_url: null, license: "MIT", signals: null, ...over,
});

function baseTables(over: Tables = {}): Tables {
  return {
    alerts: [{
      id: "al-1", user_id: "u1", kind: "security", comparison: null,
      changes: { kind: "first_seen_danger", tech_id: "t1", curr_value: { grade: "danger", reason: "문제가 있어요", fixed_version: "0.1.16", evidence: [{ id: "CVE-1", severity: "HIGH", url: "https://example.com/advisory" }] }, technologies: { display_name: "mcp-remote" } },
    }],
    scenarios: [],
    ai_calls: [],
    tech_relations: [{ tech_a: "t1", tech_b: "t2", status: "confirmed" }],
    technologies: [techRow("t1", "mcp-remote"), techRow("t2", "supergateway")],
    ...over,
  };
}

const goodAnswer = JSON.stringify({ steps: ["설정 파일의 버전을 0.1.16으로 바꿔 주세요."], risks: ["연결 설정이 달라질 수 있어요. 버전을 이전 값으로 되돌리면 돼요."], sources: ["https://example.com/advisory", "https://made-up.example/x"] });

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

const input = { alertId: "al-1", userId: "u1", now: NOW };
const run = (userDb: SupabaseClient, serviceDb: SupabaseClient, ai: AiClient | null, over = {}) => generateScenario({ userDb, serviceDb, ai }, { ...input, ...over });

test("보안 알림: 요청 → 만드는 중 줄 → 대체 기술 비교표(코드)와 Claude의 단계·위험을 저장하고 호출을 기록한다", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables());
  const { ai, seen } = fakeAi();

  const result = await run(user.db, service.db, ai);

  assert.deepEqual(result, { status: "created", scenarioId: "scenarios-1" });
  const inserted = user.writes.find((w) => w.table === "scenarios" && w.op === "insert");
  assert.deepEqual([inserted?.value.alert_id, inserted?.value.requested_by, inserted?.value.status], ["al-1", "u1", "generating"]);
  assert.match(seen[0].user, /supergateway/);
  const saved = service.writes.find((w) => w.table === "scenarios" && w.op === "update")!.value;
  assert.equal(saved.status, "done");
  assert.deepEqual(saved.body.steps, ["설정 파일의 버전을 0.1.16으로 바꿔 주세요."]);
  assert.equal(saved.body.comparison.altName, "supergateway");
  assert.equal(saved.body.comparison.rows.length, 5);
  assert.deepEqual(saved.sources, ["https://example.com/advisory"]); // 지어낸 출처는 버림
  const call = service.writes.find((w) => w.table === "ai_calls")!.value;
  assert.deepEqual([call.purpose, call.user_id, call.status, call.tokens_in, call.tokens_out], ["scenario", "u1", "succeeded", 100, 50]);
});

test("적용 기회 알림: 저장해 둔 비교표를 쓰고 같은 역할 기술을 다시 읽지 않는다", async () => {
  const rows = [{ item: "하는 일", mine: { value: "내 것", source: "https://example.com/m" }, theirs: { value: "새 것", source: null } }];
  const tables = baseTables();
  tables.alerts[0] = { ...tables.alerts[0], kind: "opportunity", comparison: { myTechName: "mcp-remote", newTechName: "supergateway", confirmedAt: null, rows } };
  tables.tech_relations = [];
  const user = fakeDb(tables);
  const service = fakeDb(baseTables({ tech_relations: [] }));
  const { ai, seen } = fakeAi();

  const result = await run(user.db, service.db, ai);

  assert.equal(result.status, "created");
  assert.match(seen[0].user, /새 것/);
  const saved = service.writes.find((w) => w.table === "scenarios" && w.op === "update")!.value;
  assert.deepEqual(saved.body.comparison, { techName: "mcp-remote", altName: "supergateway", rows });
});

test("같은 역할로 확정된 기술이 없으면 비교표 없이 만든다(지어내지 않음)", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables({ tech_relations: [] }));
  const { ai, seen } = fakeAi();

  const result = await run(user.db, service.db, ai);

  assert.equal(result.status, "created");
  assert.match(seen[0].user, /확정된 같은 역할 기술이 없어요/);
  assert.equal(service.writes.find((w) => w.table === "scenarios" && w.op === "update")!.value.body.comparison, null);
});

test("남의 알림이나 없는 알림은 거절하고 아무것도 쓰거나 부르지 않는다", async () => {
  for (const over of [{ userId: "u-other" }, { alertId: "al-none" }]) {
    const user = fakeDb(baseTables());
    const service = fakeDb(baseTables());
    const { ai, seen } = fakeAi();

    const result = await run(user.db, service.db, ai, over);

    assert.deepEqual(result, { status: "refused", reason: "not_found" });
    assert.equal(seen.length + user.writes.length + service.writes.length, 0);
  }
});

test("오늘 5번을 다 썼으면 거절하고(어제 것은 안 셈), 서비스 하루 200번이면 거절한다", async () => {
  const used = (n: number, at: string) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, requested_by: "u1", created_at: at }));
  const user = fakeDb(baseTables({ scenarios: [...used(5, TODAY), ...used(3, YESTERDAY)] }));
  const service = fakeDb(baseTables());
  const { ai, seen } = fakeAi();
  assert.deepEqual(await run(user.db, service.db, ai), { status: "refused", reason: "user_limit" });

  const four = fakeDb(baseTables({ scenarios: [...used(4, TODAY), ...used(9, YESTERDAY)] }));
  assert.equal((await run(four.db, fakeDb(baseTables()).db, ai)).status, "created");

  const busy = fakeDb(baseTables({ ai_calls: Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, created_at: TODAY })) }));
  assert.deepEqual(await run(fakeDb(baseTables()).db, busy.db, ai), { status: "refused", reason: "service_limit" });
  assert.equal(seen.length, 1); // 거절된 둘에는 부르지 않았다
});

test("Claude 연결이 없으면(키 없음) 거절하고 한도도 줄 안 쓴다", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables());

  assert.deepEqual(await run(user.db, service.db, null), { status: "refused", reason: "not_configured" });
  assert.equal(user.writes.length + service.writes.length, 0);
});

test("Claude 호출이 실패하면 던지지 않고 줄을 실패로 남기며 오류의 비밀 값은 가린다", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables());
  const { ai } = fakeAi(new Error(`503 ${FAKE_GH}`));

  const result = await run(user.db, service.db, ai);

  assert.equal(result.status, "failed");
  const saved = service.writes.find((w) => w.table === "scenarios" && w.op === "update")!.value;
  assert.equal(saved.status, "failed");
  const call = service.writes.find((w) => w.table === "ai_calls")!.value;
  assert.equal(call.status, "failed");
  assert.ok(!String(call.error).includes(FAKE_GH));
});

test("답의 모양이 틀리면 실패로 남기되 이미 쓴 토큰은 기록한다", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables());
  const { ai } = fakeAi("이건 JSON이 아니에요");

  const result = await run(user.db, service.db, ai);

  assert.equal(result.status, "failed");
  const call = service.writes.find((w) => w.table === "ai_calls")!.value;
  assert.deepEqual([call.status, call.tokens_in, call.tokens_out], ["failed", 100, 50]);
});

test("답에 설치 명령이 섞여 있으면 저장하기 전에 공식 문서 안내로 바꾼다", async () => {
  const answer = JSON.stringify({ steps: ["npm install mcp-remote@0.1.16 실행"], risks: ["되돌리기"], sources: [] });
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables());

  await run(user.db, service.db, fakeAi(answer).ai);

  const saved = service.writes.find((w) => w.table === "scenarios" && w.op === "update")!.value;
  assert.deepEqual(saved.body.steps, [COMMAND_NOTICE]);
});

test("대체 기술을 읽지 못하면 비교표가 없다고 속이지 않고 실패로 남기며 Claude를 부르지 않는다", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables(), { "read:tech_relations": "연결 실패" });
  const { ai, seen } = fakeAi();

  const result = await run(user.db, service.db, ai);

  assert.equal(result.status, "failed");
  assert.equal(seen.length, 0);
  assert.equal(service.writes.find((w) => w.table === "scenarios" && w.op === "update")!.value.status, "failed");
});

test("결과를 저장하지 못해도 던지지 않고, 이미 든 호출은 기록한다", async () => {
  const user = fakeDb(baseTables());
  const service = fakeDb(baseTables(), { "update:scenarios": "쓰기 거부" });
  const { ai } = fakeAi();

  const result = await run(user.db, service.db, ai);

  assert.equal(result.status, "failed");
  const call = service.writes.find((w) => w.table === "ai_calls")!.value;
  assert.deepEqual([call.status, call.tokens_in], ["failed", 100]);
});
