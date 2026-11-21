import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { markTemplateNoteHelpful, readTemplateNotes, reportTemplateNote, saveTemplateNote } from "./template-notes.ts";

type Answer = { data: unknown; error: { message: string; code?: string } | null };
type Call = { table: string; op: string; row?: unknown; filters: [string, unknown][] };
const TPL = "33333333-3333-4333-8333-333333333333";
const NOTE = "44444444-4444-4444-8444-444444444444";

// 가짜 DB(usage-notes.test.ts와 같은 모양): 표마다 정해 둔 답, 보낸 요청을 남긴다. rpc는 "rpc:함수이름" 답
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
        select: () => builder, eq: (c: string, v: unknown) => (call.filters.push([c, v]), builder),
        in: (c: string, v: unknown) => (call.filters.push([c, v]), builder), order: () => builder, limit: () => builder,
        then: (resolve: (a: Answer) => unknown) => resolve(answers[table] ?? { data: [], error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const ok = (data: unknown = [{ id: NOTE }]): Answer => ({ data, error: null });
const fail = (code?: string): Answer => ({ data: null, error: { message: "x", code } });
const note = { usedFor: "사내 위키", result: "잘 됨", tip: "단계 이름은 짧게" };

test("템플릿 사용기: 쓴 사람 칸은 보내지 않고(DB 기본값) 네 칸만, 잘못된 id · 규칙에 안 맞는 글은 DB를 부르지 않는다", async () => {
  const { db, calls } = fakeDb({ template_notes: ok() });
  assert.deepEqual(await saveTemplateNote(db, TPL, note), { ok: true });
  assert.deepEqual(calls, [{ table: "template_notes", op: "insert", row: { template_id: TPL, used_for: "사내 위키", result: "잘 됨", tip: "단계 이름은 짧게" }, filters: [] }]);
  const none = fakeDb({});
  assert.equal((await saveTemplateNote(none.db, "x", note)).ok, false);
  assert.equal((await saveTemplateNote(none.db, TPL, { ...note, tip: " " })).ok, false);
  assert.equal(none.calls.length, 0);
});

test("템플릿 사용기: RLS 거절(써 보지 않음 · 작가 · 닫힌 템플릿)은 쉬운 말, 만든 줄이 없으면 실패(불변 4)", async () => {
  const r = await saveTemplateNote(fakeDb({ template_notes: fail("42501") }).db, TPL, note);
  assert.match(r.ok ? "" : r.error, /확정해 본 뒤에/);
  assert.equal((await saveTemplateNote(fakeDb({ template_notes: ok([]) }).db, TPL, note)).ok, false);
  assert.deepEqual(await saveTemplateNote(fakeDb({ template_notes: fail("23505") }).db, TPL, note), { ok: false, error: "이 템플릿에는 이미 사용기를 썼어요" });
});

test("도움이 됐어요 · 신고: 한 번만(23505), 막힌 글(42501)은 쉬운 말", async () => {
  assert.deepEqual(await markTemplateNoteHelpful(fakeDb({ template_helpful_votes: ok([{ note_id: NOTE }]) }).db, "u1", NOTE), { ok: true });
  assert.deepEqual(await markTemplateNoteHelpful(fakeDb({ template_helpful_votes: fail("23505") }).db, "u1", NOTE), { ok: false, error: "이미 눌렀어요" });
  assert.match((await markTemplateNoteHelpful(fakeDb({ template_helpful_votes: fail("42501") }).db, "u1", NOTE) as { error: string }).error, /누를 수 없어요/);
  assert.deepEqual(await reportTemplateNote(fakeDb({ template_reports: ok() }).db, "u1", NOTE, "광고"), { ok: true });
  assert.deepEqual(await reportTemplateNote(fakeDb({ template_reports: fail("23505") }).db, "u1", NOTE, "광고"), { ok: false, error: "이미 신고했어요" });
  assert.equal((await reportTemplateNote(fakeDb({}).db, "u1", NOTE, " ")).ok, false);
});

test("템플릿 사용기 읽기: 내 글 · 누름 · 신고 표시, 쓴 사람 id는 읽지 않음, 못 읽으면 던진다(불변 2)", async () => {
  const row = { id: NOTE, used_for: "a", result: "b", tip: "c", helpful_count: 2, created_at: "2026-11-22T00:00:00Z" };
  const { db, calls } = fakeDb({ template_notes: ok([row]), "rpc:my_template_note_ids": ok([NOTE]), template_helpful_votes: ok([{ note_id: NOTE }]), template_reports: ok([]) });
  const [v] = await readTemplateNotes(db, TPL, "u1");
  assert.deepEqual([v.mine, v.voted, v.reported, v.helpfulCount], [true, true, false, 2]);
  assert.deepEqual(calls[0].filters, [["template_id", TPL]]);
  await assert.rejects(readTemplateNotes(fakeDb({ template_notes: fail() }).db, TPL, "u1"), /읽지 못함/);
});

test("손님(viewerId null)은 사용기 줄만 읽고 내 글 · 누른 기록은 묻지 않는다(anon엔 그 권한이 없음), 못 읽으면 던진다", async () => {
  const row = { id: NOTE, used_for: "a", result: "b", tip: "c", helpful_count: 2, created_at: "2026-11-22T00:00:00Z" };
  const { db, calls } = fakeDb({ template_notes: ok([row]) });
  const [v] = await readTemplateNotes(db, TPL, null);
  assert.deepEqual([v.mine, v.voted, v.reported, v.helpfulCount], [false, false, false, 2]);
  assert.deepEqual(calls.map((c) => c.table), ["template_notes"]);
  await assert.rejects(readTemplateNotes(fakeDb({ template_notes: fail() }).db, TPL, null), /읽지 못함/);
});
