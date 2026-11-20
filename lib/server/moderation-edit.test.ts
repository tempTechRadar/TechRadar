import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleReports, hideNote, readReports, unhideNote, type ModCtx } from "./moderation-edit.ts";

type Err = { message: string; code?: string } | null;
type Answer = { data: unknown; error: Err };
type Call = { table: string; op: string; patch?: unknown; row?: unknown; columns?: string; filters: [string, unknown][] };

const NOTE = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-0000000000aa";
const ok = (data: unknown): Answer => ({ data, error: null });
const bad = (message = "x", code?: string): Answer => ({ data: null, error: { message, code } });

// 가짜 DB: "표.동작"마다 정해 둔 답(없으면 빈 줄)을 주고, 보낸 요청을 남긴다. 동작 = select·update·insert
function fakeDb(answers: Record<string, Answer>) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [] };
      calls.push(call);
      const done = () => answers[`${table}.${call.op}`] ?? ok(call.op === "select" ? [] : []);
      const b: Record<string, unknown> = {
        select: (columns?: string) => (call.op === "select" && (call.columns ??= columns), b),
        update: (patch: unknown) => ((call.op = "update"), (call.patch = patch), b),
        insert: (row: unknown) => ((call.op = "insert"), (call.row = row), b),
        eq: (c: string, v: unknown) => (call.filters.push([c, v]), b),
        is: (c: string, v: unknown) => (call.filters.push([`${c} is`, v]), b),
        in: (c: string, v: unknown) => (call.filters.push([c, v]), b),
        order: () => b, limit: () => b,
        maybeSingle: () => { const a = done(); return Promise.resolve({ data: Array.isArray(a.data) ? a.data[0] ?? null : a.data, error: a.error }); },
        then: (resolve: (a: Answer) => unknown) => resolve(done()),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
const ctx = (db: SupabaseClient, audit: SupabaseClient | null): ModCtx => ({ db, audit, userId: ADMIN });
const REASON = "광고성 글이라 숨겨요";

test("글 숨기기: 숨긴 사람=나·시각=지금, 처리 전 신고도 함께 처리함, 기록은 서비스 연결로만", async () => {
  const main = fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: null }]), "usage_notes.update": ok([{ id: NOTE }]), "reports.update": ok([{ id: "r1" }, { id: "r2" }]) });
  const audit = fakeDb({ "audit_logs.insert": ok([]) });
  const r = await hideNote(ctx(main.db, audit.db), NOTE, REASON);
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false, reports: 2 });
  const hide = main.calls.find((c) => c.table === "usage_notes" && c.op === "update")!;
  assert.equal((hide.patch as { hidden_by: string }).hidden_by, ADMIN);
  assert.ok(typeof (hide.patch as { hidden_at: string }).hidden_at === "string");
  assert.deepEqual(hide.filters, [["id", NOTE], ["hidden_at is", null]]);
  const handled = main.calls.find((c) => c.table === "reports" && c.op === "update")!;
  assert.equal((handled.patch as { handled_by: string }).handled_by, ADMIN);
  assert.equal((handled.patch as { handle_reason: string }).handle_reason, REASON);
  assert.deepEqual(handled.filters, [["note_id", NOTE], ["handled_at is", null]]);
  assert.equal(audit.calls.length, 1);
  assert.deepEqual(audit.calls[0].row, { actor_id: ADMIN, actor_role: "admin", action: "hide_note", target_table: "usage_notes", target_id: NOTE, reason: REASON });
  assert.equal(main.calls.some((c) => c.table === "audit_logs"), false); // 관리자 연결로는 기록을 쓰지 않는다
});

test("이미 숨긴 글은 바꾸지 않는다", async () => {
  const main = fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: "2026-11-20T01:00:00Z" }]) });
  const r = await hideNote(ctx(main.db, fakeDb({}).db), NOTE, REASON);
  assert.deepEqual(r, { ok: true, changed: false, auditFailed: false, reports: 0 });
  assert.equal(main.calls.some((c) => c.op === "update"), false);
});

test("사유가 짧거나 비밀값 같으면 DB를 부르지 않는다", async () => {
  for (const why of ["", "짧음", "x".repeat(301), "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"]) {
    const main = fakeDb({});
    const r = await hideNote(ctx(main.db, null), NOTE, why);
    assert.deepEqual(r, { ok: false, code: "reason" });
    assert.equal(main.calls.length, 0);
  }
});

test("UUID가 아닌 id와 없는 글", async () => {
  const main = fakeDb({});
  assert.deepEqual(await hideNote(ctx(main.db, null), "not-a-uuid", REASON), { ok: false, code: "not_found" });
  assert.equal(main.calls.length, 0);
  const none = fakeDb({ "usage_notes.select": ok([]) });
  assert.deepEqual(await hideNote(ctx(none.db, null), NOTE, REASON), { ok: false, code: "not_found" });
});

test("권한이 없어 0줄이 바뀌면 숨겼다고 하지 않는다 (불변 4·5)", async () => {
  const main = fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: null }]), "usage_notes.update": ok([]) });
  const r = await hideNote(ctx(main.db, fakeDb({}).db), NOTE, REASON);
  assert.deepEqual(r, { ok: false, code: "failed" });
  assert.equal(main.calls.some((c) => c.table === "reports" && c.op === "update"), false); // 숨기지 못했으면 신고는 그대로
});

test("신고 처리 표시가 실패해도 이미 숨긴 것은 되돌리지 않고 알린다", async () => {
  const main = fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: null }]), "usage_notes.update": ok([{ id: NOTE }]), "reports.update": bad("boom") });
  const r = await hideNote(ctx(main.db, fakeDb({ "audit_logs.insert": ok([]) }).db), NOTE, REASON);
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false, reports: -1 }); // -1 = 신고 처리 표시를 못 했다
});

test("바꾼 기록을 못 남기면(서비스 연결 없음·오류) 바뀐 것은 그대로 두고 auditFailed", async () => {
  const mk = () => fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: null }]), "usage_notes.update": ok([{ id: NOTE }]), "reports.update": ok([]) });
  assert.equal((await hideNote(ctx(mk().db, null), NOTE, REASON) as { auditFailed: boolean }).auditFailed, true);
  assert.equal((await hideNote(ctx(mk().db, fakeDb({ "audit_logs.insert": bad("nope") }).db), NOTE, REASON) as { auditFailed: boolean }).auditFailed, true);
});

test("숨김 풀기: 숨긴 칸 둘을 비우고 기록한다. 숨기지 않은 글은 그대로", async () => {
  const main = fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: "2026-11-20T01:00:00Z" }]), "usage_notes.update": ok([{ id: NOTE }]) });
  const audit = fakeDb({ "audit_logs.insert": ok([]) });
  const r = await unhideNote(ctx(main.db, audit.db), NOTE, REASON);
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false, reports: 0 });
  const upd = main.calls.find((c) => c.op === "update")!;
  assert.deepEqual(upd.patch, { hidden_at: null, hidden_by: null });
  assert.equal((audit.calls[0].row as { action: string }).action, "unhide_note");
  const visible = fakeDb({ "usage_notes.select": ok([{ id: NOTE, hidden_at: null }]) });
  assert.deepEqual(await unhideNote(ctx(visible.db, null), NOTE, REASON), { ok: true, changed: false, auditFailed: false, reports: 0 });
});

test("신고만 처리함으로: 글은 건드리지 않고 처리 전 신고만 바꾼다", async () => {
  const main = fakeDb({ "reports.update": ok([{ id: "r1" }]) });
  const audit = fakeDb({ "audit_logs.insert": ok([]) });
  const r = await handleReports(ctx(main.db, audit.db), NOTE, REASON);
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false, reports: 1 });
  assert.equal(main.calls.some((c) => c.table === "usage_notes"), false);
  assert.equal((audit.calls[0].row as { action: string }).action, "handle_report");
  const none = fakeDb({ "reports.update": ok([]) });
  assert.deepEqual(await handleReports(ctx(none.db, null), NOTE, REASON), { ok: true, changed: false, auditFailed: false, reports: 0 });
});

test("신고 처리 표시가 실패하면(권한·오류) 처리했다고 하지 않고 기록도 남기지 않는다 (불변 4)", async () => {
  const main = fakeDb({ "reports.update": bad("boom") });
  const audit = fakeDb({ "audit_logs.insert": ok([]) });
  assert.deepEqual(await handleReports(ctx(main.db, audit.db), NOTE, REASON), { ok: false, code: "failed" });
  assert.equal(audit.calls.length, 0);
});

test("읽기: 신고 → 글 → 기술 이름을 묶고, 읽지 못하면 던진다", async () => {
  const { db, calls } = fakeDb({
    "reports.select": ok([{ id: "r1", note_id: NOTE, reason: "광고", created_at: "2026-11-20T02:00:00Z", handled_at: null, handle_reason: null }]),
    "usage_notes.select": ok([{ id: NOTE, tech_id: "t1", used_for: "a", result: "b", tip: "c", helpful_count: 2, hidden_at: null, created_at: "2026-11-20T01:00:00Z" }]),
    "technologies.select": ok([{ id: "t1", display_name: "mcp-proxy" }]),
  });
  const data = await readReports(db);
  assert.ok(data); // 표가 있으면 null이 아니다
  assert.equal(data.reports[0].reason, "광고");
  assert.equal(data.notes[0].helpfulCount, 2);
  assert.equal(data.techs[0].name, "mcp-proxy");
  const noteCall = calls.find((c) => c.table === "usage_notes")!;
  assert.deepEqual(noteCall.filters, [["id", [NOTE]]]);
  await assert.rejects(readReports(fakeDb({ "reports.select": bad("boom") }).db), /신고를 읽지 못함/);
  const empty = await readReports(fakeDb({ "reports.select": ok([]) }).db);
  assert.deepEqual(empty, { reports: [], notes: [], techs: [] });
});

test("읽기: 사용기·신고 표가 아직 DB에 없으면 그렇게 알린다 (조회 실패와 다르게)", async () => {
  const none = await readReports(fakeDb({ "reports.select": bad('relation "public.reports" does not exist', "42P01") }).db);
  assert.equal(none, null);
});

test("읽을 칸에 쓴 사람·신고한 사람이 없다", async () => {
  const { db, calls } = fakeDb({ "reports.select": ok([{ id: "r1", note_id: NOTE, reason: "x", created_at: "t", handled_at: null, handle_reason: null }]), "usage_notes.select": ok([]), "technologies.select": ok([]) });
  await readReports(db);
  const text = JSON.stringify(calls);
  assert.doesNotMatch(text, /author_id|reporter_id|hidden_by/);
});
