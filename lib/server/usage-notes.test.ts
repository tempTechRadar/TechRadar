import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markHelpful, readTopUsageNotes, readUsageNotes, reportNote, saveUsageNote } from "./usage-notes.ts";

type Err = { message: string; code?: string } | null;
type Answer = { data: unknown; error: Err };
type Call = { table: string; op: string; row?: unknown; columns?: string; filters: [string, unknown][] };

// 가짜 DB: 표마다 정해 둔 답을 주고, 보낸 요청을 남긴다. rpc는 "rpc:함수이름" 답을 준다
function fakeDb(answers: Record<string, Answer>) {
  const calls: Call[] = [];
  const db = {
    rpc(name: string, args: unknown) {
      calls.push({ table: `rpc:${name}`, op: "rpc", row: args, filters: [] });
      return Promise.resolve(answers[`rpc:${name}`] ?? { data: [], error: null });
    },
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {
        insert: (row: unknown) => ((call.op = "insert"), (call.row = row), builder),
        select: (columns?: string) => (call.op === "select" && (call.columns ??= columns), builder), // insert 뒤의 select는 돌려받을 칸이라 적지 않는다
        eq: (c: string, v: unknown) => (call.filters.push([c, v]), builder),
        in: (c: string, v: unknown) => (call.filters.push([c, v]), builder),
        order: () => builder,
        limit: () => builder,
        then: (resolve: (a: Answer) => unknown) => resolve(answers[table] ?? { data: [], error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const ok = (data: unknown = [{ id: "n1" }]): Answer => ({ data, error: null });
const fail = (code?: string, message = "x"): Answer => ({ data: null, error: { message, code } });
const note = { usedFor: "검색", result: "잘 됨", tip: "팁" };

test("사용기는 본인(author_id)으로 보이는 다섯 칸만 보낸다", async () => {
  const { db, calls } = fakeDb({ usage_notes: ok() });
  assert.deepEqual(await saveUsageNote(db, "u1", "t1", note), { ok: true });
  assert.deepEqual(calls, [{ table: "usage_notes", op: "insert", row: { author_id: "u1", tech_id: "t1", used_for: "검색", result: "잘 됨", tip: "팁" }, filters: [] }]);
});

test("규칙에 안 맞는 글은 DB를 부르지 않는다", async () => {
  const { db, calls } = fakeDb({});
  const r = await saveUsageNote(db, "u1", "t1", { ...note, tip: "  " });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

test("저장 실패와 빈 응답은 저장했다고 하지 않고, 오류 글의 비밀값은 가린다", async () => {
  const failed = await saveUsageNote(fakeDb({ usage_notes: fail("500", "boom sk-ant-api03-abcdefghijklmnop") }).db, "u1", "t1", note);
  assert.equal(failed.ok, false);
  assert.doesNotMatch(failed.ok ? "" : failed.error, /abcdefghijklmnop/);
  assert.equal((await saveUsageNote(fakeDb({ usage_notes: ok([]) }).db, "u1", "t1", note)).ok, false);
});

test("도움이 됐어요: 본인 이름으로 한 줄, 이미 눌렀으면 그렇게 알린다", async () => {
  const good = fakeDb({ helpful_votes: ok([{ note_id: "n1" }]) });
  assert.deepEqual(await markHelpful(good.db, "u2", "n1"), { ok: true });
  assert.deepEqual(good.calls[0].row, { note_id: "n1", user_id: "u2" });
  const twice = await markHelpful(fakeDb({ helpful_votes: fail("23505") }).db, "u2", "n1");
  assert.deepEqual(twice, { ok: false, error: "이미 눌렀어요" });
});

test("도움이 됐어요: 자기 글·숨긴 글(권한 오류 42501)은 누를 수 없다고 알린다", async () => {
  const r = await markHelpful(fakeDb({ helpful_votes: fail("42501") }).db, "u1", "n1");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /누를 수 없어요/);
});

test("신고: 사유를 검사하고 본인 이름으로 한 줄, 같은 글 두 번째는 이미 했다고 알린다", async () => {
  const good = fakeDb({ reports: ok([{ id: "r1" }]) });
  assert.deepEqual(await reportNote(good.db, "u2", "n1", " 광고 "), { ok: true });
  assert.deepEqual(good.calls[0].row, { note_id: "n1", reporter_id: "u2", reason: "광고" });
  assert.deepEqual(await reportNote(fakeDb({ reports: fail("23505") }).db, "u2", "n1", "광고"), { ok: false, error: "이미 신고했어요" });
  const blank = fakeDb({});
  assert.equal((await reportNote(blank.db, "u2", "n1", "  ")).ok, false);
  assert.equal(blank.calls.length, 0);
  const own = await reportNote(fakeDb({ reports: fail("42501") }).db, "u1", "n1", "광고");
  assert.match(own.ok ? "" : own.error, /신고할 수 없어요/);
});

test("목록: 그 기술의 글에 내가 눌렀는지·내 글인지를 붙이고, 읽기 실패는 던진다", async () => {
  const rows = [
    { id: "n2", used_for: "a", result: "b", tip: "c", helpful_count: 3, created_at: "2026-11-20T01:00:00Z" },
    { id: "n1", used_for: "d", result: "e", tip: "f", helpful_count: 0, created_at: "2026-11-19T01:00:00Z" },
  ];
  // 내 글은 쓴 사람 칸을 읽지 않고 DB 함수가 "이 글들 중 내 것"만 돌려준다(함수는 값만 담은 배열을 돌려준다)
  const { db, calls } = fakeDb({ usage_notes: ok(rows), "rpc:my_usage_note_ids": ok(["n1"]), helpful_votes: ok([{ note_id: "n2" }]), reports: ok([{ note_id: "n1" }]) });
  const list = await readUsageNotes(db, "t1", "u1");
  assert.deepEqual(list, [
    { id: "n2", usedFor: "a", result: "b", tip: "c", helpfulCount: 3, createdAt: "2026-11-20T01:00:00Z", mine: false, voted: true, reported: false },
    { id: "n1", usedFor: "d", result: "e", tip: "f", helpfulCount: 0, createdAt: "2026-11-19T01:00:00Z", mine: true, voted: false, reported: true },
  ]);
  assert.deepEqual(calls[0].filters, [["tech_id", "t1"]]);
  assert.equal(JSON.stringify(list).includes("author"), false); // 쓴 사람의 id는 화면에 넘기지 않는다
  assert.doesNotMatch(calls[0].columns ?? "", /author_id|hidden_by/); // DB에서도 읽지 않는다(그 칸은 읽기 권한이 없다)
  assert.deepEqual(calls.find((c) => c.table === "rpc:my_usage_note_ids")?.row, { p_ids: ["n2", "n1"] });
  await assert.rejects(readUsageNotes(fakeDb({ usage_notes: fail("500", "boom") }).db, "t1", "u1"), /사용기를 읽지 못함/);
});

test("내 글 표시를 못 읽으면 내 글이 아닌 것처럼 보이지 않고 읽기 실패로 던진다", async () => {
  const rows = [{ id: "n1", used_for: "a", result: "b", tip: "c", helpful_count: 0, created_at: "2026-11-19T01:00:00Z" }];
  const db = fakeDb({ usage_notes: ok(rows), "rpc:my_usage_note_ids": fail("500", "boom") }).db;
  await assert.rejects(readUsageNotes(db, "t1", "u1"), /내 글 표시를 읽지 못함/);
});

test("목록이 비면 내가 누른 것·신고한 것은 읽지 않는다", async () => {
  const { db, calls } = fakeDb({ usage_notes: ok([]) });
  assert.deepEqual(await readUsageNotes(db, "t1", "u1"), []);
  assert.deepEqual(calls.map((c) => c.table), ["usage_notes"]);
});

test("사용기 요약: 도움 많은 순 몇 개와 전체 수, 못 읽으면 던진다(없음과 다르게)", async () => {
  const rows = [{ id: "n2", used_for: "검색", result: "잘 됨", tip: "팁", helpful_count: 5 }];
  const { db, calls } = fakeDb({ usage_notes: { data: rows, error: null, count: 7 } as Answer });
  assert.deepEqual(await readTopUsageNotes(db, "t1"), { total: 7, top: [{ id: "n2", usedFor: "검색", result: "잘 됨", tip: "팁", helpfulCount: 5 }] });
  assert.deepEqual(calls[0].filters, [["tech_id", "t1"]]);
  await assert.rejects(readTopUsageNotes(fakeDb({ usage_notes: fail() }).db, "t1"));
});

test("사용기 수(손님용 집계): 숫자만 받고 글은 읽지 않는다, 못 읽으면 던진다", async () => {
  const { readUsageNoteCount } = await import("./usage-notes.ts");
  const { db, calls } = fakeDb({ "rpc:usage_note_count": ok(3) });
  assert.equal(await readUsageNoteCount(db, "t1"), 3);
  assert.deepEqual(calls.map((c) => c.table), ["rpc:usage_note_count"]);
  await assert.rejects(readUsageNoteCount(fakeDb({ "rpc:usage_note_count": fail() }).db, "t1"), /사용기 수를 읽지 못함/);
});
