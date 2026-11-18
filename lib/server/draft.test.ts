import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { generateDraft } from "./draft.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

// 실제 DB 대신 메모리 표로 "무엇을 읽고 무엇을 쓰려 했는지"만 모으는 가짜 클라이언트
function fakeDb(tables: Tables, errors: Record<string, string> = {}) {
  const inserts: { table: string; row: Row }[] = [];
  const updates: { table: string; values: Row }[] = [];
  const db = {
    from(table: string) {
      const readError = errors[`read:${table}`];
      return {
        insert(row: Row) {
          inserts.push({ table, row });
          (tables[table] ??= []).push(row);
          return Promise.resolve({ error: errors[`write:${table}`] ? { message: errors[`write:${table}`] } : null });
        },
        update(values: Row) {
          updates.push({ table, values });
          let targets = tables[table] ?? [];
          const q = {
            eq(col: string, val: unknown) { targets = targets.filter((r) => r[col] === val); return q; },
            is(col: string, val: unknown) { targets = targets.filter((r) => (r[col] ?? null) === val); return q; },
            select: () => {
              targets.forEach((r) => Object.assign(r, values));
              return Promise.resolve(errors[`write:${table}`] ? { data: null, error: { message: errors[`write:${table}`] } } : { data: targets.map((r) => ({ id: r.id })), error: null });
            },
          };
          return q;
        },
        select() {
          let result = tables[table] ?? [];
          const failed = readError ? { data: null, error: { message: readError } } : null;
          const q = {
            eq(col: string, val: unknown) { result = result.filter((r) => r[col] === val); return q; },
            gte(col: string, val: string) { result = result.filter((r) => String(r[col]) >= val); return q; },
            single: () => Promise.resolve(failed ?? (result.length === 1 ? { data: result[0], error: null } : { data: null, error: { message: "한 줄이 아님" } })),
            then: (resolve: (v: unknown) => unknown) => Promise.resolve(failed ?? { data: result, error: null }).then(resolve),
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, inserts, updates };
}

const NOW = new Date("2026-11-18T05:00:00Z"); // 한국 11-18 14:00 → 오늘은 UTC 11-17T15:00부터

function baseTables(): Tables {
  return {
    changes: [{
      id: "change-1", kind: "grade_to_danger", tech_id: "tech-1", draft_response: null, draft_sources: null,
      prev_value: { grade: "caution" },
      curr_value: { grade: "danger", reason: "외부에서 내 컴퓨터 명령을 실행시킬 수 있어요", fixed_version: "0.1.16", evidence: [{ id: "CVE-1", severity: "HIGH", fixed: "0.1.16", url: "https://osv.dev/CVE-1" }] },
    }],
    technologies: [{ id: "tech-1", display_name: "mcp-remote" }],
    ai_calls: [],
  };
}

const okAnswer = JSON.stringify({ draft: "고친 버전 0.1.16으로 올리기를 권해요.", sources: ["https://osv.dev/CVE-1", "https://evil.example/지어낸것"] });

function fakeAi(answer: string | Error) {
  const prompts: { system: string; user: string }[] = [];
  const ai: AiClient = {
    async complete(prompt) {
      prompts.push(prompt);
      if (answer instanceof Error) throw answer;
      return { text: answer, tokensIn: 120, tokensOut: 80 };
    },
  };
  return { ai, prompts };
}

const input = { changeId: "change-1", now: NOW };

test("초안을 만들어 changes에 저장하고(지어낸 출처는 버림), ai_calls에 성공으로 남긴다", async () => {
  const tables = baseTables();
  const { db, inserts } = fakeDb(tables);
  const { ai, prompts } = fakeAi(okAnswer);

  const result = await generateDraft(db, ai, input);

  assert.deepEqual(result, { status: "created" });
  assert.equal(prompts.length, 1);
  assert.match(prompts[0].user, /mcp-remote/);
  assert.match(prompts[0].user, /주의 → 위험/);
  assert.equal(tables.changes[0].draft_response, "고친 버전 0.1.16으로 올리기를 권해요.");
  assert.deepEqual(tables.changes[0].draft_sources, ["https://osv.dev/CVE-1"]);
  const [call] = inserts.filter((i) => i.table === "ai_calls");
  assert.equal(call.row.purpose, "draft");
  assert.equal(call.row.status, "succeeded");
  assert.equal(call.row.user_id, null); // 초안은 변경마다 한 번 공용이라 사용자가 없다
  assert.match(String(call.row.input_hash), /^[0-9a-f]{64}$/);
  assert.equal(call.row.tokens_in, 120);
  assert.equal(call.row.tokens_out, 80);
});

test("이미 초안이 있거나 보안 변경이 아니면 Claude를 부르지 않고 아무것도 쓰지 않는다", async () => {
  const drafted = baseTables();
  drafted.changes[0].draft_response = "예전 초안";
  const notSecurity = baseTables();
  notSecurity.changes[0].kind = "same_role_new";

  for (const [tables, reason] of [[drafted, "already_drafted"], [notSecurity, "not_security"]] as const) {
    const { db, inserts } = fakeDb(tables);
    const { ai, prompts } = fakeAi(okAnswer);

    assert.deepEqual(await generateDraft(db, ai, input), { status: "skipped", reason });
    assert.equal(prompts.length, 0, reason);
    assert.equal(inserts.length, 0, reason);
  }
});

test("서비스 전체 하루 200번을 채웠으면 부르지 않는다(어제 것은 세지 않고, 실패한 시도도 센다)", async () => {
  const tables = baseTables();
  tables.ai_calls = [
    { created_at: "2026-11-17T14:59:00Z", status: "succeeded" }, // 한국 어제
    ...Array.from({ length: 199 }, () => ({ created_at: "2026-11-17T16:00:00Z", status: "succeeded" })),
    { created_at: "2026-11-18T01:00:00Z", status: "failed" },
  ];
  const { db } = fakeDb(tables);
  const { ai, prompts } = fakeAi(okAnswer);

  assert.deepEqual(await generateDraft(db, ai, input), { status: "skipped", reason: "service_limit" });
  assert.equal(prompts.length, 0);
});

test("Claude가 오류를 내면 던지지 않고 실패로 알리며, 오류(비밀값은 가림)를 ai_calls에 남기고 초안은 비워 둔다", async () => {
  const tables = baseTables();
  const { db, inserts } = fakeDb(tables);
  const { ai } = fakeAi(new Error("연결 실패 sk-" + "a1B2c3D4e5F6g7H8i9J0"));

  const result = await generateDraft(db, ai, input);

  assert.equal(result.status, "failed");
  assert.equal(tables.changes[0].draft_response, null);
  const [call] = inserts.filter((i) => i.table === "ai_calls");
  assert.equal(call.row.status, "failed");
  assert.match(String(call.row.error), /연결 실패/);
  assert.equal(String(call.row.error).includes("a1B2c3D4"), false);
});

test("답이 정해진 형식이 아니면 실패로 보고 초안을 저장하지 않는다", async () => {
  const tables = baseTables();
  const { db, inserts } = fakeDb(tables);
  const { ai } = fakeAi("그냥 글이에요");

  const result = await generateDraft(db, ai, input);

  assert.equal(result.status, "failed");
  assert.equal(tables.changes[0].draft_response, null);
  assert.equal(inserts.find((i) => i.table === "ai_calls")?.row.status, "failed");
});

test("Claude 연결(키)이 아직 없으면 실패(not_configured)로 알리고 호출 기록도 안 남긴다", async () => {
  const { db, inserts } = fakeDb(baseTables());

  const result = await generateDraft(db, null, input);

  assert.deepEqual(result, { status: "failed", reason: "not_configured" });
  assert.equal(inserts.length, 0);
});

test("DB 읽기가 실패해도 던지지 않고 실패로 알린다(알림 만들기가 이어지게)", async () => {
  const { db } = fakeDb(baseTables(), { "read:ai_calls": "연결 실패" });
  const { ai, prompts } = fakeAi(okAnswer);

  const result = await generateDraft(db, ai, input);

  assert.equal(result.status, "failed");
  assert.equal(prompts.length, 0);
});

test("runId가 있으면 summarize 단계를 기록한다: 만들었으면 성공, 실패하면 실패(이미 있어서 건너뛴 것은 기록 안 함)", async () => {
  const created = fakeDb(baseTables());
  await generateDraft(created.db, fakeAi(okAnswer).ai, { ...input, runId: "run-1" });
  const failed = fakeDb(baseTables());
  await generateDraft(failed.db, fakeAi("그냥 글이에요").ai, { ...input, runId: "run-1" });
  const drafted = baseTables();
  drafted.changes[0].draft_response = "예전 초안";
  const skipped = fakeDb(drafted);
  await generateDraft(skipped.db, fakeAi(okAnswer).ai, { ...input, runId: "run-1" });

  const step = (t: ReturnType<typeof fakeDb>) => t.inserts.filter((i) => i.table === "run_steps").map((i) => [i.row.step_name, i.row.status]);
  assert.deepEqual(step(created), [["summarize", "succeeded"]]);
  assert.deepEqual(step(failed), [["summarize", "failed"]]);
  assert.deepEqual(step(skipped), []);
});

test("부르는 사이에 다른 쪽이 먼저 초안을 만들었으면 덮어쓰지 않고 건너뛴다(호출은 기록한다)", async () => {
  const tables = baseTables();
  const { db, inserts } = fakeDb(tables);
  const racing: AiClient = {
    async complete() {
      tables.changes[0].draft_response = "다른 쪽이 먼저 만든 초안";
      return { text: okAnswer };
    },
  };

  const result = await generateDraft(db, racing, input);

  assert.deepEqual(result, { status: "skipped", reason: "already_drafted" });
  assert.equal(tables.changes[0].draft_response, "다른 쪽이 먼저 만든 초안");
  assert.equal(inserts.find((i) => i.table === "ai_calls")?.row.status, "succeeded");
});
