import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { MAX_BATCHES_PER_RUN, translateOneLiners, translateRows, type Row } from "./translate-one-liners.ts";

const NOW = new Date("2026-11-24T01:00:00Z");
const row = (i: number, over: Partial<Row> = {}): Row => ({ id: `id${i}`, display_name: `Tool${i}`, one_liner: `Does thing ${i}`, one_liner_ko: null, one_liner_ko_src: null, ...over });

// 메모리 표: technologies(update … eq(id) eq(one_liner) select) · ai_calls(insert). failUpdateFor: 그 id의 저장이 실패
function fakeDb(rows: Row[], opt: { failUpdateFor?: string } = {}) {
  const store = new Map(rows.map((r) => [r.id, { ...r } as Row]));
  const calls: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table === "ai_calls") return { insert: (r: Record<string, unknown>) => { calls.push(r); return Promise.resolve({ error: null }); } };
      if (table !== "technologies") throw new Error(`예상 못 한 표 ${table}`);
      return {
        update: (patch: Partial<Row>) => {
          const f: { id?: string; one_liner?: string } = {};
          const q = {
            eq: (col: "id" | "one_liner", v: string) => { f[col] = v; return q; },
            select: () => {
              if (f.id === opt.failUpdateFor) return Promise.resolve({ data: null, error: { message: "DB 오류" } });
              const t = store.get(f.id!);
              if (!t || t.one_liner !== f.one_liner) return Promise.resolve({ data: [], error: null });
              Object.assign(t, patch);
              return Promise.resolve({ data: [{ id: t.id }], error: null });
            },
          };
          return q;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, store, calls };
}

// 보낸 글(JSON)에서 id를 읽어 "KO:<원문>"으로 답하는 가짜 모델
const echoAi = (log: { n: number } = { n: 0 }): AiClient => ({
  async complete({ user }) {
    log.n++;
    const items = JSON.parse(/<자료 출처="[^"]*">\n([\s\S]*?)\n<\/자료>/.exec(user)![1]) as { id: string; text: string }[];
    return { text: JSON.stringify(items.map((x) => ({ id: x.id, ko: `KO:${x.text}` }))), tokensIn: 100, tokensOut: 50 };
  },
});

test("번역기: 번역이 없는 줄을 20개씩 묶어 저장하고(원문 src · 시각 포함) ai_calls에 translate로 남긴다", async () => {
  const rows = Array.from({ length: 45 }, (_, i) => row(i));
  const { db, store, calls } = fakeDb(rows);
  const log = { n: 0 };
  const out = await translateRows({ db, ai: echoAi(log), now: NOW }, rows);
  assert.deepEqual([out.targets, out.batches, out.translated, out.failedBatches, out.dropped, out.saveFailed], [45, 3, 45, 0, 0, 0]);
  assert.equal(log.n, 3, "묶음마다 호출 1번");
  assert.deepEqual(store.get("id7"), { ...row(7), one_liner_ko: "KO:Does thing 7", one_liner_ko_src: "Does thing 7", one_liner_ko_at: NOW.toISOString() });
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => c.purpose === "translate" && c.user_id === null && c.status === "succeeded" && typeof c.input_hash === "string" && c.tokens_in === 100));
});

test("번역기: 이미 번역된 줄은 다시 부르지 않고(불변 3), 원문이 바뀐 줄만 다시 번역한다", async () => {
  const rows = [row(1, { one_liner_ko: "옛 번역", one_liner_ko_src: "Does thing 1" }), row(2, { one_liner: "New text", one_liner_ko: "옛 번역2", one_liner_ko_src: "Old text" })];
  const { db, store } = fakeDb(rows);
  const out = await translateRows({ db, ai: echoAi(), now: NOW }, rows);
  assert.deepEqual([out.targets, out.translated], [1, 1]);
  assert.equal(store.get("id1")!.one_liner_ko, "옛 번역", "번역된 줄은 그대로");
  assert.deepEqual([store.get("id2")!.one_liner_ko, store.get("id2")!.one_liner_ko_src], ["KO:New text", "New text"]);
  const log = { n: 0 };
  const again = await translateRows({ db, ai: echoAi(log), now: NOW }, [store.get("id1")!, store.get("id2")!]);
  assert.deepEqual([again.targets, again.batches, log.n], [0, 0, 0], "다시 돌려도 호출 없음");
});

test("번역기: 호출이 실패한 묶음은 건너뛰고(있던 번역은 지우지 않음) 다음 묶음은 계속하며, 실패를 ai_calls에 남긴다(불변 4)", async () => {
  const rows = [...Array.from({ length: 20 }, (_, i) => row(i, { one_liner_ko: "있던 번역", one_liner_ko_src: "옛 원문" })), ...Array.from({ length: 5 }, (_, i) => row(100 + i))];
  const { db, store, calls } = fakeDb(rows);
  let n = 0;
  const ai: AiClient = { async complete(p) { if (++n === 1) throw new Error("Claude 응답 529: overloaded sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA"); return echoAi().complete(p); } };
  const out = await translateRows({ db, ai, now: NOW }, rows);
  assert.deepEqual([out.batches, out.failedBatches, out.translated], [2, 1, 5]);
  assert.equal(store.get("id3")!.one_liner_ko, "있던 번역", "실패한 묶음의 줄은 그대로");
  assert.equal(store.get("id3")!.one_liner_ko_src, "옛 원문");
  assert.deepEqual(calls.map((c) => c.status), ["failed", "succeeded"]);
  assert.ok(!JSON.stringify(out.errors).includes("sk-ant-api03-AAAA") && !JSON.stringify(calls).includes("sk-ant-api03-AAAA"), "키 모양은 가려서 남긴다");
});

test("번역기: 답이 JSON이 아니면 그 묶음은 실패로 세고 아무것도 쓰지 않는다. 답에서 빠졌거나 어긋난 줄은 버린 것으로 센다", async () => {
  const rows = [row(1), row(2), row(3)];
  const a = fakeDb(rows);
  const bad = await translateRows({ db: a.db, ai: { complete: async () => ({ text: "번역했어요" }) }, now: NOW }, rows);
  assert.deepEqual([bad.failedBatches, bad.translated], [1, 0]);
  assert.ok([...a.store.values()].every((r) => r.one_liner_ko === null));
  const b = fakeDb(rows);
  const partial = await translateRows({ db: b.db, ai: { complete: async () => ({ text: JSON.stringify([{ id: "id1", ko: "하나" }, { id: "엉뚱", ko: "x" }]) }) }, now: NOW }, rows);
  assert.deepEqual([partial.translated, partial.dropped, partial.failedBatches], [1, 2, 0], "번역을 못 받은 줄 id2 · id3(엉뚱한 id는 줄이 아님)");
  assert.equal(b.store.get("id1")!.one_liner_ko, "하나");
  assert.equal(b.store.get("id2")!.one_liner_ko, null, "빠진 줄은 다음 실행에");
});

test("번역기: 읽은 뒤 원문이 바뀐 줄은 저장하지 않고 세며, 저장 오류는 숨기지 않고 센다", async () => {
  const rows = [row(1), row(2), row(3)];
  const { db, store } = fakeDb(rows, { failUpdateFor: "id3" });
  store.get("id2")!.one_liner = "바뀐 원문"; // 읽은(rows) 뒤에 DB 원문이 바뀜
  const out = await translateRows({ db, ai: echoAi(), now: NOW }, rows);
  assert.deepEqual([out.translated, out.changedSinceRead, out.saveFailed], [1, 1, 1]);
  assert.equal(store.get("id2")!.one_liner_ko, null);
  assert.match(out.errors.join(), /저장하지 못함/);
});

test("번역기: dry-run은 부르기만 하고 technologies · ai_calls에 아무것도 쓰지 않으며 샘플을 돌려준다", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => row(i));
  const { db, store, calls } = fakeDb(rows);
  const out = await translateRows({ db, ai: echoAi(), dryRun: true, limit: 3, now: NOW }, rows);
  assert.deepEqual([out.translated, out.samples.length], [3, 3]);
  assert.deepEqual(out.samples[0], { id: "id0", name: "Tool0", en: "Does thing 0", ko: "KO:Does thing 0" });
  assert.ok([...store.values()].every((r) => r.one_liner_ko === null) && calls.length === 0);
});

test("번역기: 키가 없으면(ai null) 읽지도 부르지도 않는다", async () => {
  const none = await translateOneLiners({ db: { from() { throw new Error("읽으면 안 됨"); } } as unknown as SupabaseClient, ai: null });
  assert.equal(none.status, "not_configured");
});

test("번역기: 너무 긴 원문은 건너뛰고 세며, 한 번 실행의 묶음 수에는 상한이 있다", async () => {
  const longRows = [row(1, { one_liner: "x".repeat(401) }), row(2)];
  const out = await translateRows({ db: fakeDb(longRows).db, ai: echoAi(), now: NOW }, longRows);
  assert.deepEqual([out.tooLong, out.translated], [1, 1]);
  const many = Array.from({ length: (MAX_BATCHES_PER_RUN + 3) * 20 }, (_, i) => row(i));
  const log = { n: 0 };
  await translateRows({ db: fakeDb(many).db, ai: echoAi(log), now: NOW }, many);
  assert.equal(log.n, MAX_BATCHES_PER_RUN);
});
