// 프로젝트 이름·메모 고치기, 보관, 되살리기(PRD-F4). 불변 4(저장 실패 시 처리 완료로 보이지 않음)·불변 5(본인 것만)를 가짜 DB로 시험한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "./my-tech.ts";
import { archiveProject, editProject, isArchivedRepo, readArchivedProjectIds, restoreProject } from "./project-edit.ts";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is" | "not-null"; col: string; val: unknown };
type Op = { table: string; op: "select" | "update"; row?: Row; filters: Filter[] };

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // U1의 저장소 프로젝트
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; // U2의 저장소 프로젝트
const PL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // U1의 "프로젝트 밖"
const PA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"; // U1이 이미 보관한 프로젝트
const ARCHIVED_AT = "2026-11-01T00:00:00.000Z";

const tables = (): Record<string, Row[]> => ({
  projects: [
    { id: P1, owner_id: U1, kind: "repo", name: "old", memo: null, archived_at: null, repo_url: "https://github.com/o/r" },
    { id: P2, owner_id: U2, kind: "repo", name: "남의 것", memo: null, archived_at: null, repo_url: "https://github.com/o/x" },
    { id: PL, owner_id: U1, kind: "local", name: "내 컴퓨터(프로젝트 밖)", memo: null, archived_at: null, repo_url: null },
    { id: PA, owner_id: U1, kind: "repo", name: "보관됨", memo: "m", archived_at: ARCHIVED_AT, repo_url: "https://github.com/o/archived" },
  ],
});

/** 메모리 표 + 호출 기록. fail.select/update는 DB 오류, fail.zeroRows는 update가 한 줄도 못 바꾼 경우(동시에 다른 곳이 바꿈). */
function fakeDb(data: Record<string, Row[]>, fail: { select?: boolean; update?: boolean; zeroRows?: boolean } = {}) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      let single = false;
      const q: Record<string, unknown> = {};
      const hits = () => (data[table] ?? []).filter((r) => op.filters.every((f) => (f.kind === "eq" ? r[f.col] === f.val : f.kind === "is" ? (r[f.col] ?? null) === f.val : (r[f.col] ?? null) !== null)));
      q.select = () => q;
      q.eq = (col: string, val: unknown) => (op.filters.push({ kind: "eq", col, val }), q);
      q.is = (col: string, val: unknown) => (op.filters.push({ kind: "is", col, val }), q);
      q.not = (col: string, _op: string, _val: unknown) => (op.filters.push({ kind: "not-null", col, val: null }), q);
      q.update = (row: Row) => ((op.op = "update"), (op.row = row), q);
      q.maybeSingle = () => ((single = true), q);
      q.then = (res: (v: unknown) => unknown) => {
        ops.push(op);
        if (op.op === "update") {
          if (fail.update) return Promise.resolve({ data: null, error: { message: "DB 오류" } }).then(res);
          const found = fail.zeroRows ? [] : hits();
          found.forEach((r) => Object.assign(r, op.row));
          return Promise.resolve({ data: found.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        if (fail.select) return Promise.resolve({ data: null, error: { message: "DB 오류" } }).then(res);
        const found = hits();
        return Promise.resolve({ data: single ? (found[0] ?? null) : found, error: null }).then(res);
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, ops, updates: () => ops.filter((o) => o.op === "update") };
}

/** 바꾼 기록(audit_logs) 쪽 가짜 서비스 연결. failing이면 insert가 실패한다. */
function fakeAudit(failing = false) {
  const rows: Row[] = [];
  const audit = {
    from(table: string) {
      return { insert: (row: Row) => (rows.push({ table, ...row }), Promise.resolve({ error: failing ? { message: "기록 실패" } : null })) };
    },
  } as unknown as SupabaseClient;
  return { audit, rows };
}

const setup = (userId = U1, opts: { failing?: boolean; fail?: Parameters<typeof fakeDb>[1]; noAudit?: boolean } = {}) => {
  const data = tables();
  const d = fakeDb(data, opts.fail);
  const a = fakeAudit(opts.failing);
  const ctx: Ctx = { db: d.db, audit: opts.noAudit ? null : a.audit, userId };
  return { ctx, data, ...d, auditRows: a.rows };
};
const row = (data: Record<string, Row[]>, id: string) => data.projects.find((r) => r.id === id)!;

// ───────── 고치기

test("이름·메모를 고친다: 두 칸만 보내고, 본인·저장소·보관 안 함을 조건에 걸고, 기록을 남긴다", async () => {
  const s = setup();
  const r = await editProject(s.ctx, P1, { name: "  새 이름 ", memo: "한 줄 메모" });
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false });
  assert.deepEqual(s.updates()[0].row, { name: "새 이름", memo: "한 줄 메모" });
  const f = s.updates()[0].filters;
  for (const want of [{ kind: "eq", col: "id", val: P1 }, { kind: "eq", col: "owner_id", val: U1 }, { kind: "eq", col: "kind", val: "repo" }, { kind: "is", col: "archived_at", val: null }]) {
    assert.ok(f.some((x) => x.kind === want.kind && x.col === want.col && x.val === want.val), `조건 ${JSON.stringify(want)}`);
  }
  assert.deepEqual(row(s.data, P1).name, "새 이름");
  assert.deepEqual(s.auditRows, [{ table: "audit_logs", actor_id: U1, actor_role: "user", action: "project_edit", target_table: "projects", target_id: P1 }]);
});

test("검사에 걸리면 DB를 부르지 않고 이유만 돌려준다: 이름 비었음·너무 김·보이지 않는 글자", async () => {
  for (const [input, code] of [[{ name: " ", memo: "" }, "name"], [{ name: "가".repeat(61), memo: "" }, "name_long"], [{ name: "a", memo: "나".repeat(201) }, "memo_long"], [{ name: "a\nb", memo: "" }, "text"]] as const) {
    const s = setup();
    assert.deepEqual(await editProject(s.ctx, P1, input), { ok: false, code });
    assert.equal(s.ops.length, 0, "DB를 부르지 않는다");
    assert.equal(s.auditRows.length, 0);
    assert.equal(row(s.data, P1).name, "old");
  }
});

test("비밀값처럼 보이는 글은 이름·메모에 막는다(내 기술 직접 추가와 같은 규칙)", async () => {
  const token = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";
  for (const input of [{ name: token, memo: "" }, { name: "ok", memo: "토큰 " + token }]) {
    const s = setup();
    assert.deepEqual(await editProject(s.ctx, P1, input), { ok: false, code: "secret" });
    assert.equal(s.ops.length, 0);
  }
});

test("남의 프로젝트·프로젝트 밖·이미 보관한 프로젝트·없는 id는 '없음'이다: 아무것도 바꾸지 않고 기록도 없다", async () => {
  for (const id of [P2, PL, PA, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", "not-a-uuid"]) {
    const s = setup();
    assert.deepEqual(await editProject(s.ctx, id, { name: "x", memo: "" }), { ok: false, code: "not_found" }, id);
    assert.equal(s.updates().length, 0, id);
    assert.equal(s.auditRows.length, 0, id);
  }
  const s = setup();
  await editProject(s.ctx, "not-a-uuid", { name: "x", memo: "" });
  assert.equal(s.ops.length, 0, "uuid 모양이 아니면 DB도 안 부른다");
});

test("같은 값으로 고치면 바꾸지도 기록을 남기지도 않는다", async () => {
  const s = setup();
  assert.deepEqual(await editProject(s.ctx, P1, { name: "old", memo: "" }), { ok: true, changed: false, auditFailed: false });
  assert.equal(s.updates().length, 0);
  assert.equal(s.auditRows.length, 0);
});

test("저장이 실패하면 '고쳤어요'로 보이지 않는다: 실패를 돌려주고 기존 값과 기록은 그대로(불변 4)", async () => {
  for (const fail of [{ update: true }, { zeroRows: true }]) {
    const s = setup(U1, { fail });
    assert.deepEqual(await editProject(s.ctx, P1, { name: "새", memo: "" }), { ok: false, code: "failed" });
    assert.equal(row(s.data, P1).name, fail.zeroRows ? "old" : "old");
    assert.equal(s.auditRows.length, 0, "바뀌지 않았으니 기록도 없다");
  }
  const s = setup(U1, { fail: { select: true } });
  assert.deepEqual(await editProject(s.ctx, P1, { name: "새", memo: "" }), { ok: false, code: "failed" });
});

test("바꾼 기록을 못 남겨도 이미 고친 것은 되돌리지 않고 auditFailed로 알린다", async () => {
  for (const opts of [{ failing: true }, { noAudit: true }]) {
    const s = setup(U1, opts);
    assert.deepEqual(await editProject(s.ctx, P1, { name: "새", memo: "" }), { ok: true, changed: true, auditFailed: true });
    assert.equal(row(s.data, P1).name, "새");
  }
});

// ───────── 보관·되살리기

test("보관하면 archived_at이 지금으로 채워지고 기록이 남는다. 지우지 않는다", async () => {
  const s = setup();
  const before = Date.now();
  assert.deepEqual(await archiveProject(s.ctx, P1), { ok: true, changed: true, auditFailed: false });
  const at = String(row(s.data, P1).archived_at);
  assert.match(at, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(Date.parse(at) >= before - 1000 && Date.parse(at) <= Date.now() + 1000);
  assert.deepEqual(Object.keys(s.updates()[0].row ?? {}), ["archived_at"], "다른 칸은 건드리지 않는다");
  assert.equal(s.data.projects.length, 4, "줄을 지우지 않는다");
  const f = s.updates()[0].filters;
  assert.ok(f.some((x) => x.col === "owner_id" && x.val === U1) && f.some((x) => x.col === "kind" && x.val === "repo") && f.some((x) => x.kind === "is" && x.col === "archived_at"));
  assert.equal(s.auditRows[0].action, "project_archive");
  assert.equal(s.auditRows[0].target_id, P1);
});

test("이미 보관한 것을 또 보관해도(두 번 누름) 바꾸지도 기록하지도 않고 성공이다", async () => {
  const s = setup();
  assert.deepEqual(await archiveProject(s.ctx, PA), { ok: true, changed: false, auditFailed: false });
  assert.equal(s.updates().length, 0);
  assert.equal(s.auditRows.length, 0);
  assert.equal(row(s.data, PA).archived_at, ARCHIVED_AT, "보관 시각을 덮어쓰지 않는다");
});

test("남의 프로젝트·프로젝트 밖은 보관할 수 없다(없음)", async () => {
  for (const id of [P2, PL, "not-a-uuid"]) {
    const s = setup();
    assert.deepEqual(await archiveProject(s.ctx, id), { ok: false, code: "not_found" }, id);
    assert.equal(s.updates().length, 0, id);
    assert.equal(s.auditRows.length, 0, id);
  }
});

test("보관 저장이 실패하면 보관한 것처럼 보이지 않는다(불변 4)", async () => {
  for (const fail of [{ update: true }, { zeroRows: true }, { select: true }]) {
    const s = setup(U1, { fail });
    assert.deepEqual(await archiveProject(s.ctx, P1), { ok: false, code: "failed" });
    assert.equal(row(s.data, P1).archived_at, null);
    assert.equal(s.auditRows.length, 0);
  }
});

test("되살리면 archived_at이 비워지고 기록이 남는다. 보관하지 않은 것은 바꾸지 않는다", async () => {
  const s = setup();
  assert.deepEqual(await restoreProject(s.ctx, PA), { ok: true, changed: true, auditFailed: false });
  assert.equal(row(s.data, PA).archived_at, null);
  assert.deepEqual(Object.keys(s.updates()[0].row ?? {}), ["archived_at"]);
  assert.equal(s.auditRows[0].action, "project_restore");
  const again = setup();
  assert.deepEqual(await restoreProject(again.ctx, P1), { ok: true, changed: false, auditFailed: false });
  assert.equal(again.updates().length, 0);
  assert.equal(again.auditRows.length, 0);
});

test("남의 프로젝트는 되살릴 수 없고, 되살리기 저장이 실패하면 되살린 것처럼 보이지 않는다", async () => {
  const other = setup(U2);
  assert.deepEqual(await restoreProject(other.ctx, PA), { ok: false, code: "not_found" });
  assert.equal(row(other.data, PA).archived_at, ARCHIVED_AT);
  const s = setup(U1, { fail: { update: true } });
  assert.deepEqual(await restoreProject(s.ctx, PA), { ok: false, code: "failed" });
  assert.equal(row(s.data, PA).archived_at, ARCHIVED_AT);
});

// ───────── 보관한 주소를 다시 등록하는 경우

test("isArchivedRepo: 내가 보관한 같은 주소면 true, 활성이거나 없거나 남의 것이면 false", async () => {
  const s = setup();
  assert.equal(await isArchivedRepo(s.db, U1, "https://github.com/o/archived"), true);
  assert.equal(await isArchivedRepo(s.db, U1, "https://github.com/o/r"), false, "보관 안 한 프로젝트");
  assert.equal(await isArchivedRepo(s.db, U1, "https://github.com/o/none"), false, "없는 주소");
  assert.equal(await isArchivedRepo(s.db, U2, "https://github.com/o/archived"), false, "남이 보관한 주소는 내 것이 아니다");
});

test("isArchivedRepo: 조회가 실패하면 '보관 아님'으로 삼키지 않고 던진다(불변 2)", async () => {
  const s = setup(U1, { fail: { select: true } });
  await assert.rejects(() => isArchivedRepo(s.db, U1, "https://github.com/o/archived"), /보관/);
});

// ───────── 보관한 프로젝트의 기술을 세거나 보여 주지 않으려는 화면들이 쓰는 조회

test("readArchivedProjectIds: 내가 보관한 프로젝트 id만(남의 보관분·보관 안 한 것은 빠진다)", async () => {
  const s = setup();
  s.data.projects.push({ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", owner_id: U2, kind: "repo", name: "남이 보관", memo: null, archived_at: ARCHIVED_AT, repo_url: "https://github.com/o/y" });
  assert.deepEqual([...(await readArchivedProjectIds(s.db, U1))], [PA]);
  assert.deepEqual([...(await readArchivedProjectIds(s.db, U2))], ["ffffffff-ffff-4fff-8fff-ffffffffffff"]);
});

test("readArchivedProjectIds: 읽지 못하면 '보관한 것 없음'으로 삼키지 않고 던진다(불변 2: 보관분을 빼지 못한 채 숫자를 보이지 않게)", async () => {
  const s = setup(U1, { fail: { select: true } });
  await assert.rejects(() => readArchivedProjectIds(s.db, U1), /보관한 프로젝트를 읽지 못함/);
});
