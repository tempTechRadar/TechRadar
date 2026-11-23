import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { NOT_IN_WIKI } from "../ai/build-chat-prompt.ts";
import type { WikiPage } from "../wiki/find-pages.ts";
import { askWiki } from "./chat.ts";

type Insert = { table: string; row: Record<string, unknown> };

/**
 * 가짜 DB: select(...).eq().gte()는 정해 둔 줄 수를 돌려주고, insert는 기록만 한다.
 * status=failed로 거른 읽기는 `표:failed` 수를, 나머지는 `표` 수를 돌려준다(오늘 실패한 내 질문 세기)
 */
function fakeDb(counts: Record<string, number>, opts: { insertError?: string; readError?: string } = {}) {
  const inserts: Insert[] = [];
  const filters: string[] = [];
  const db = {
    from(table: string) {
      let failedOnly = false;
      const rows = () => Array.from({ length: (failedOnly ? counts[`${table}:failed`] : counts[table]) ?? 0 }, (_, i) => ({ id: `r${i}` }));
      const result = () => (opts.readError ? { data: null, error: { message: opts.readError } } : { data: rows(), error: null });
      const q: Record<string, unknown> = {
        eq: (col: string, val: unknown) => { filters.push(`${table}.${col}=${val}`); if (col === "status" && val === "failed") failedOnly = true; return q; },
        gte: () => q,
        then: (resolve: (v: unknown) => unknown) => resolve(result()),
      };
      return {
        select: () => q,
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return Promise.resolve({ data: null, error: opts.insertError ? { message: opts.insertError } : null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, inserts, filters };
}

function fakeAi(reply: string | Error) {
  const calls: { system: string; user: string }[] = [];
  const ai: AiClient = {
    async complete(prompt) {
      calls.push(prompt);
      if (reply instanceof Error) throw reply;
      return { text: reply, tokensIn: 100, tokensOut: 20 };
    },
  };
  return { ai, calls };
}

const pages: WikiPage[] = [{ path: "wiki/정기-실행.md", title: "정기 실행", text: "매일 06:00(한국 시간)에 돈다." }];
const now = new Date("2026-11-20T03:00:00Z");
const input = { userId: "u-admin", question: "정기 실행은 언제 도나요?", now };
const goodReply = '{"answer":"매일 06:00(한국 시간)에 돌아요.","sources":["wiki/정기-실행.md"]}';

test("정상: 찾은 쪽만 Claude에 주고, 답·출처를 돌려주며 ai_calls와 chat_logs에 남긴다", async () => {
  const user = fakeDb({ chat_logs: 0 });
  const service = fakeDb({ ai_calls: 0 });
  const { ai, calls } = fakeAi(goodReply);
  const r = await askWiki({ userDb: user.db, serviceDb: service.db, ai, pages }, input);
  assert.deepEqual(r, { status: "answered", answer: "매일 06:00(한국 시간)에 돌아요.", sources: ["wiki/정기-실행.md"], saved: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].user, /<자료 출처="wiki\/정기-실행.md">/);
  assert.deepEqual(service.inserts.map((i) => [i.table, i.row.purpose, i.row.user_id, i.row.status]), [["ai_calls", "chatbot", "u-admin", "succeeded"]]);
  assert.deepEqual(user.inserts.map((i) => i.table), ["chat_logs"]);
  assert.deepEqual(user.inserts[0].row, { user_id: "u-admin", question: input.question, answer: "매일 06:00(한국 시간)에 돌아요.", wiki_pages: ["wiki/정기-실행.md"] });
  assert.ok(user.filters.includes("chat_logs.user_id=u-admin"), "내 질문만 센다");
});

test("맞는 쪽이 없으면 Claude를 부르지 않고 '위키에 없습니다'를 남긴다(키가 없어도)", async () => {
  const user = fakeDb({});
  const service = fakeDb({});
  const r = await askWiki({ userDb: user.db, serviceDb: service.db, ai: null, pages }, { ...input, question: "운영 DB 백업 주기는?" });
  assert.deepEqual(r, { status: "answered", answer: NOT_IN_WIKI, sources: [], saved: true });
  assert.equal(service.inserts.length, 0);
  assert.deepEqual(user.inserts[0].row.wiki_pages, []);
});

test("오늘 20개를 이미 물었으면 거절하고 아무것도 부르거나 남기지 않는다", async () => {
  const user = fakeDb({ chat_logs: 20 });
  const service = fakeDb({ ai_calls: 0 });
  const { ai, calls } = fakeAi(goodReply);
  assert.deepEqual(await askWiki({ userDb: user.db, serviceDb: service.db, ai, pages }, input), { status: "refused", reason: "user_limit" });
  assert.equal(calls.length + user.inserts.length + service.inserts.length, 0);
});

test("서비스 전체 오늘 200번이면 거절", async () => {
  const { ai } = fakeAi(goodReply);
  const r = await askWiki({ userDb: fakeDb({ chat_logs: 0 }).db, serviceDb: fakeDb({ ai_calls: 200 }).db, ai, pages }, input);
  assert.deepEqual(r, { status: "refused", reason: "service_limit" });
});

test("키가 없으면(쪽은 찾았는데) 부르지 않고 not_configured", async () => {
  const r = await askWiki({ userDb: fakeDb({}).db, serviceDb: fakeDb({}).db, ai: null, pages }, input);
  assert.deepEqual(r, { status: "refused", reason: "not_configured" });
});

test("Claude 오류면 실패 기록(비밀값 가림)을 ai_calls에 남기고 chat_logs에는 안 남긴다", async () => {
  const user = fakeDb({});
  const service = fakeDb({});
  const { ai } = fakeAi(new Error("401 ANTHROPIC_API_KEY=sk-secret12345678"));
  const r = await askWiki({ userDb: user.db, serviceDb: service.db, ai, pages }, input);
  assert.equal(r.status, "failed");
  assert.equal(service.inserts[0].row.status, "failed");
  assert.equal(String(service.inserts[0].row.error).includes("sk-secret12345678"), false);
  assert.equal(user.inserts.length, 0);
});

test("답 모양이 틀리면 실패로 기록하고 답을 지어내지 않는다", async () => {
  const service = fakeDb({});
  const { ai } = fakeAi("그냥 아무 글");
  const r = await askWiki({ userDb: fakeDb({}).db, serviceDb: service.db, ai, pages }, input);
  assert.equal(r.status, "failed");
  assert.equal(service.inserts[0].row.status, "failed");
});

test("chat_logs 저장이 실패해도 답은 보여 주고 saved=false", async () => {
  const { ai } = fakeAi(goodReply);
  const r = await askWiki({ userDb: fakeDb({}, { insertError: "rls" }).db, serviceDb: fakeDb({}).db, ai, pages }, input);
  assert.equal(r.status === "answered" && r.saved, false);
});

test("빈 질문·300자 넘는 질문은 거절", async () => {
  const deps = { userDb: fakeDb({}).db, serviceDb: fakeDb({}).db, ai: null, pages };
  assert.deepEqual(await askWiki(deps, { ...input, question: "   " }), { status: "refused", reason: "empty_question" });
  assert.deepEqual(await askWiki(deps, { ...input, question: "가".repeat(301) }), { status: "refused", reason: "too_long" });
});

test("한도: Claude 실패(ai_calls에만 남음)도 하루 20개에 센다 — chat_logs 15 + 내 실패 5 = 20이면 거절", async () => {
  const user = fakeDb({ chat_logs: 15 });
  const service = fakeDb({ ai_calls: 30, "ai_calls:failed": 5 });
  const { ai, calls } = fakeAi(goodReply);
  assert.deepEqual(await askWiki({ userDb: user.db, serviceDb: service.db, ai, pages }, input), { status: "refused", reason: "user_limit" });
  assert.equal(calls.length, 0);
  for (const f of ["ai_calls.user_id=u-admin", "ai_calls.purpose=chatbot", "ai_calls.status=failed"]) assert.ok(service.filters.includes(f), `내 챗봇 실패 줄만 센다: ${f}`);
});

test("한도: 성공은 chat_logs·ai_calls 둘 다에 남지만 ai_calls 성공 줄은 더하지 않는다(한 질문을 두 번 세지 않음)", async () => {
  // 오늘 성공 19번: chat_logs 19줄 + ai_calls 성공 19줄, 실패 0 → 19개로 세서 20번째는 묻는다
  const { ai, calls } = fakeAi(goodReply);
  const r = await askWiki({ userDb: fakeDb({ chat_logs: 19 }).db, serviceDb: fakeDb({ ai_calls: 19, "ai_calls:failed": 0 }).db, ai, pages }, input);
  assert.equal(r.status, "answered");
  assert.equal(calls.length, 1);
});

test("chat_logs에 남기는 질문도 Claude에 보낼 때처럼 비밀값을 가린다", async () => {
  const user = fakeDb({});
  const { ai, calls } = fakeAi(goodReply);
  const question = "정기 실행은 언제 도나요? ANTHROPIC_API_KEY=sk-secret12345678";
  const r = await askWiki({ userDb: user.db, serviceDb: fakeDb({}).db, ai, pages }, { ...input, question });
  assert.equal(r.status, "answered");
  assert.equal(String(user.inserts[0].row.question).includes("sk-secret12345678"), false);
  assert.equal(calls[0].user.includes("sk-secret12345678"), false);
});

test("위키에 없는 질문(Claude 안 부름)도 chat_logs에 가려서 남긴다", async () => {
  const user = fakeDb({});
  await askWiki({ userDb: user.db, serviceDb: fakeDb({}).db, ai: null, pages }, { ...input, question: "운영 DB 백업 주기는? password=hunter2secret" });
  assert.equal(String(user.inserts[0].row.question).includes("hunter2secret"), false);
});

test("오늘 질문 수를 못 읽으면 없다고 치지 않고 실패", async () => {
  const { ai } = fakeAi(goodReply);
  const r = await askWiki({ userDb: fakeDb({}, { readError: "down" }).db, serviceDb: fakeDb({}).db, ai, pages }, input);
  assert.equal(r.status, "failed");
});
