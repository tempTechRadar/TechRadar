// 내 기술 목록 바꾸기(숨김·되돌리기·직접 추가)와 읽기. 불변 4(저장 실패 시 처리 완료로 보이지 않음)·불변 5(본인 것만)를 가짜 DB로 시험한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addTech, checkNewTech, getMyTechDetail, recordGradeView, searchCatalog, setTechHidden, type Ctx } from "./my-tech.ts";

type Row = Record<string, unknown>;
type Op = { table: string; op: "select" | "update" | "insert"; row?: unknown; filters: [string, unknown][]; or?: string };

const ID = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const TECH = "33333333-3333-4333-8333-333333333333";

// 메모리 표 + 호출 기록. fail.update로 update를, fail.insert에 표 이름(또는 "table:23505")을 주면 그 insert를 실패시킨다.
function fakeDb(tables: Record<string, Row[]>, fail: { update?: boolean; insert?: string } = {}) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      let one = false;
      const q: Record<string, unknown> = {};
      const hits = () => (tables[table] ?? []).filter((r) => op.filters.every(([c, v]) => r[c] === v));
      for (const m of ["select", "order", "limit"]) q[m] = () => q;
      q.or = (s: string) => ((op.or = s), q);
      q.eq = (c: string, v: unknown) => (op.filters.push([c, v]), q);
      q.update = (row: unknown) => ((op.op = "update"), (op.row = row), q);
      q.insert = (row: unknown) => ((op.op = "insert"), (op.row = row), q);
      q.maybeSingle = q.single = () => ((one = true), q);
      q.then = (res: (v: unknown) => unknown) => {
        ops.push(op);
        if (op.op === "insert") {
          const [t, code] = (fail.insert ?? "").split(":");
          const error = t === table ? { message: "DB 오류", code } : null;
          return Promise.resolve({ data: error ? null : one ? { id: `${table}-new` } : [{ id: `${table}-new` }], error }).then(res);
        }
        if (op.op === "update") {
          if (fail.update) return Promise.resolve({ data: null, error: { message: "DB 오류" } }).then(res);
          const found = hits();
          found.forEach((r) => Object.assign(r, op.row));
          return Promise.resolve({ data: found, error: null }).then(res);
        }
        const found = hits();
        return Promise.resolve({ data: one ? found[0] ?? null : found, error: null }).then(res);
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, ops };
}

const mine = (extra: Row = {}): Row => ({ id: ID, owner_id: "u1", hidden_at: null, ...extra });
const ctxOf = (tables: Record<string, Row[]>, fail?: Parameters<typeof fakeDb>[1], withAudit = true) => {
  const main = fakeDb(tables, fail);
  const audit = fakeDb({});
  const ctx: Ctx = { db: main.db, audit: withAudit ? audit.db : null, userId: "u1" };
  return { ctx, ops: main.ops, auditOps: audit.ops, tables };
};
const quiet = (t: { mock: { method: (o: object, m: string, f: () => void) => unknown } }) => t.mock.method(console, "error", () => {});

test("숨기기: 본인 줄에 숨긴 시각을 쓰고, 누가·언제 바꿨는지 audit_logs에 남긴다", async () => {
  const { ctx, tables, auditOps } = ctxOf({ my_technologies: [mine()] });
  const r = await setTechHidden(ctx, ID, true);
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false });
  assert.match(String(tables.my_technologies[0].hidden_at), /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(auditOps[0].row, { actor_id: "u1", actor_role: "user", action: "tech_hide", target_table: "my_technologies", target_id: ID });
});

test("되돌리기: 숨긴 시각을 비우고 tech_restore를 남긴다", async () => {
  const { ctx, tables, auditOps } = ctxOf({ my_technologies: [mine({ hidden_at: "2026-11-18T00:00:00Z" })] });
  const r = await setTechHidden(ctx, ID, false);
  assert.equal(r.ok && r.changed, true);
  assert.equal(tables.my_technologies[0].hidden_at, null);
  assert.equal((auditOps[0].row as Row).action, "tech_restore");
});

test("이미 그 상태면 바꾸지도 기록을 남기지도 않는다(같은 버튼을 두 번 눌러도 한 번만)", async () => {
  const { ctx, ops, auditOps } = ctxOf({ my_technologies: [mine({ hidden_at: "2026-11-18T00:00:00Z" })] });
  const r = await setTechHidden(ctx, ID, true);
  assert.deepEqual(r, { ok: true, changed: false, auditFailed: false });
  assert.equal(ops.some((o) => o.op === "update"), false);
  assert.equal(auditOps.length, 0);
});

test("남의 줄은 '없음'으로 답하고 아무것도 바꾸지 않는다(불변 5). 줄 번호 모양이 틀려도 DB를 부르지 않는다", async () => {
  const { ctx, ops, auditOps } = ctxOf({ my_technologies: [mine({ owner_id: "u2" })] });
  assert.deepEqual(await setTechHidden(ctx, ID, true), { ok: false, code: "not_found" });
  assert.equal(await setTechHidden(ctx, "abc", true).then((r) => !r.ok && r.code), "not_found");
  assert.equal(ops.some((o) => o.op === "update"), false);
  assert.equal(auditOps.length, 0);
});

test("저장이 실패하면 실패로 답하고 기록도 남기지 않는다(불변 4)", async (t) => {
  quiet(t);
  const { ctx, auditOps } = ctxOf({ my_technologies: [mine()] }, { update: true });
  assert.deepEqual(await setTechHidden(ctx, ID, true), { ok: false, code: "failed" });
  assert.equal(auditOps.length, 0);
});

test("바꾼 기록을 못 남겨도 바뀐 목록은 그대로이고, auditFailed로 알린다(서비스 키 연결이 없을 때도 같다)", async (t) => {
  quiet(t);
  const { ctx, tables } = ctxOf({ my_technologies: [mine()] }, undefined, false);
  const r = await setTechHidden(ctx, ID, true);
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: true });
  assert.ok(tables.my_technologies[0].hidden_at);
});

test("직접 추가(카탈로그에서 고름): 본인·origin manual·tech_id로 한 줄을 넣고 tech_add를 남긴다. 등급 칸은 보내지 않는다", async () => {
  const { ctx, ops, auditOps } = ctxOf({});
  const r = await addTech(ctx, { projectId: PROJECT, techId: TECH, name: "무시됨", version: " 1.2.3 " });
  assert.deepEqual(r, { ok: true, id: "my_technologies-new", auditFailed: false });
  assert.deepEqual(ops.find((o) => o.op === "insert")!.row, { owner_id: "u1", added_by: "u1", project_id: PROJECT, tech_id: TECH, manual_name: null, origin: "manual", version: "1.2.3" });
  assert.equal((auditOps[0].row as Row).action, "tech_add");
});

test("직접 추가(이름만): manual_name으로 넣고 tech_id는 비운다", async () => {
  const { ctx, ops } = ctxOf({});
  await addTech(ctx, { projectId: PROJECT, techId: null, name: "  내 도구  ", version: "" });
  assert.deepEqual(ops.find((o) => o.op === "insert")!.row, { owner_id: "u1", added_by: "u1", project_id: PROJECT, tech_id: null, manual_name: "내 도구", origin: "manual", version: null });
});

test("입력 검사: 비었거나, 이름이 길거나, 비밀값 같거나, 버전 모양이 이상하면 DB를 부르지 않고 막는다", async () => {
  const bad = (techId: string | null, name: string, version = "") => checkNewTech({ projectId: PROJECT, techId, name, version });
  assert.deepEqual(bad(null, "  "), { ok: false, code: "no_target" });
  assert.deepEqual(bad("x", ""), { ok: false, code: "no_target" });
  assert.deepEqual(bad(null, "가".repeat(81)), { ok: false, code: "name" });
  assert.deepEqual(bad(null, "ghp_" + "a1B2c3D4e5F6g7H8i9J0"), { ok: false, code: "secret" });
  assert.deepEqual(bad(TECH, "", "ghp_" + "a1B2c3D4e5F6g7H8i9J0"), { ok: false, code: "secret" });
  assert.deepEqual(bad(TECH, "", "1.0; drop"), { ok: false, code: "version" });
  const { ctx, ops } = ctxOf({});
  assert.deepEqual(await addTech(ctx, { projectId: "local", techId: TECH, name: "", version: "" }), { ok: false, code: "project" });
  assert.deepEqual(await addTech(ctx, { projectId: PROJECT, techId: null, name: "", version: "" }), { ok: false, code: "no_target" });
  assert.equal(ops.length, 0);
});

test("이미 있는 기술(중복 키 23505)은 '이미 있어요'로, 그 밖의 저장 실패는 실패로 답한다. 기록은 남기지 않는다", async (t) => {
  quiet(t);
  const dup = ctxOf({}, { insert: "my_technologies:23505" });
  assert.deepEqual(await addTech(dup.ctx, { projectId: PROJECT, techId: TECH, name: "", version: "" }), { ok: false, code: "duplicate" });
  const other = ctxOf({}, { insert: "my_technologies:42501" });
  assert.deepEqual(await addTech(other.ctx, { projectId: PROJECT, techId: TECH, name: "", version: "" }), { ok: false, code: "failed" });
  assert.equal(dup.auditOps.length + other.auditOps.length, 0);
});

test("카탈로그 검색: 시연용 가짜 기술은 뺀다", async () => {
  const { ctx, ops } = ctxOf({ technologies: [{ id: TECH, tech_key: "npm:mcp-remote", display_name: "mcp-remote", type: "mcp", is_simulated: false }] });
  const hits = await searchCatalog(ctx.db, "mcp");
  assert.equal(hits.length, 1);
  assert.deepEqual(ops[0].filters, [["is_simulated", false]]);
});

test("카탈로그 검색: 거르기 문법 글자는 이 함수 안에서 지운다(호출하는 쪽이 안 거쳐도 다른 조건을 끼울 수 없다). 너무 짧으면 DB를 부르지 않는다", async () => {
  const { ctx, ops } = ctxOf({ technologies: [] });
  await searchCatalog(ctx.db, "x),id.neq.0,(y");
  assert.equal(ops[0].or, "display_name.ilike.%xid.neq.0y%,tech_key.ilike.%xid.neq.0y%");
  assert.deepEqual(await searchCatalog(ctx.db, "a"), []);
  assert.equal(ops.length, 1);
});

test("상세 읽기: 본인 줄만 묻고, 없으면 null", async () => {
  const { ctx, ops } = ctxOf({ my_technologies: [mine({ grade: "danger" })] });
  assert.equal((await getMyTechDetail(ctx.db, "u1", ID))?.grade, "danger");
  assert.deepEqual(ops[0].filters, [["id", ID], ["owner_id", "u1"]]);
  assert.equal(await getMyTechDetail(ctx.db, "u2", ID), null);
});

test("등급 열람 기록: 본인·기술로 한 줄. 못 남기면 false만 돌려주고 던지지 않는다", async (t) => {
  quiet(t);
  const ok = ctxOf({});
  assert.equal(await recordGradeView(ok.ctx, TECH), true);
  assert.deepEqual(ok.ops.find((o) => o.op === "insert")!.row, { user_id: "u1", tech_id: TECH });
  const bad = ctxOf({}, { insert: "grade_views" });
  assert.equal(await recordGradeView(bad.ctx, TECH), false);
});

test("등급 열람 기록: 이미 열어 본 기술이면 새로 쓰지 않는다(새로 고칠 때마다 줄이 쌓이지 않음). 다른 사람·다른 기술의 기록은 세지 않는다", async () => {
  const seen = ctxOf({ grade_views: [{ user_id: "u1", tech_id: TECH }] });
  assert.equal(await recordGradeView(seen.ctx, TECH), true);
  assert.equal(seen.ops.some((o) => o.op === "insert"), false);
  const others = ctxOf({ grade_views: [{ user_id: "u2", tech_id: TECH }, { user_id: "u1", tech_id: "other" }] });
  await recordGradeView(others.ctx, TECH);
  assert.equal(others.ops.some((o) => o.op === "insert"), true);
});
