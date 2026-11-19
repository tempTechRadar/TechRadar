// 같은 역할 확정·규칙 고치기(P-18b, ADR 0015, 불변 4·5)를 가짜 DB로 시험한다.
// 바꾸기는 관리자 본인 연결(db)로만, 바꾼 기록(audit_logs)은 서버 연결(audit)로만 쓴다.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addRule, confirmRelation, setRuleEnabled, type EditCtx } from "./classify-edit.ts";

type Row = Record<string, unknown>;
type Op = { table: string; op: "select" | "update" | "insert"; row?: Row; filters: [string, unknown][] };

const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REL = "11111111-1111-4111-8111-111111111111";
const RULE = "22222222-2222-4222-8222-222222222222";

// 메모리 표. blockWrites: RLS가 막은 것처럼 update/insert가 0줄(오류 없음). insertCode: insert 오류 코드.
function fakeDb(tables: Record<string, Row[]>, opt: { blockWrites?: boolean; insertCode?: string; fail?: boolean } = {}) {
  const ops: Op[] = [];
  const db = {
    from(table: string) {
      const op: Op = { table, op: "select", filters: [] };
      let one = false;
      const q: Record<string, unknown> = {};
      const hits = () => (tables[table] ?? []).filter((r) => op.filters.every(([c, v]) => r[c] === v));
      q.select = () => q;
      q.eq = (c: string, v: unknown) => (op.filters.push([c, v]), q);
      q.update = (row: Row) => ((op.op = "update"), (op.row = row), q);
      q.insert = (row: Row) => ((op.op = "insert"), (op.row = row), q);
      q.maybeSingle = q.single = () => ((one = true), q);
      q.then = (res: (v: unknown) => unknown) => {
        ops.push(op);
        if (opt.fail && op.op !== "select") return Promise.resolve({ data: null, error: { message: "DB 오류 내부 글" } }).then(res);
        if (op.op === "insert") {
          if (opt.insertCode) return Promise.resolve({ data: null, error: { message: "duplicate key", code: opt.insertCode } }).then(res);
          if (opt.blockWrites) return Promise.resolve({ data: null, error: { message: "new row violates row-level security policy", code: "42501" } }).then(res);
          (tables[table] ??= []).push({ id: `${table}-new`, ...op.row });
          return Promise.resolve({ data: one ? { id: `${table}-new` } : [{ id: `${table}-new` }], error: null }).then(res);
        }
        if (op.op === "update") {
          if (opt.blockWrites) return Promise.resolve({ data: [], error: null }).then(res);
          const found = hits();
          found.forEach((r) => Object.assign(r, op.row));
          return Promise.resolve({ data: found.map((r) => ({ id: r.id })), error: null }).then(res);
        }
        const found = hits();
        return Promise.resolve({ data: one ? found[0] ?? null : found, error: null }).then(res);
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { db, ops };
}

function ctx(tables: Record<string, Row[]>, opt: Parameters<typeof fakeDb>[1] = {}, audit: "ok" | "fail" | "none" = "ok") {
  const user = fakeDb(tables, opt);
  const log = fakeDb({ audit_logs: [] }, audit === "fail" ? { fail: true } : {});
  const c: EditCtx = { db: user.db, audit: audit === "none" ? null : log.db, userId: ADMIN };
  return { c, userOps: user.ops, auditOps: log.ops };
}

test("같은 역할 확정: 후보를 확정으로, 확정한 사람은 나, 시각을 넣고 사유를 바꾼 기록에 남긴다", async () => {
  const rel = { id: REL, status: "candidate", confirmed_by: null, confirmed_at: null };
  const { c, userOps, auditOps } = ctx({ tech_relations: [rel] });
  const r = await confirmRelation(c, REL, "공식 문서에서 대체 관계 확인");
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false });
  const upd = userOps.find((o) => o.op === "update")!;
  assert.equal(upd.table, "tech_relations");
  assert.equal(upd.row!.status, "confirmed");
  assert.equal(upd.row!.confirmed_by, ADMIN);
  assert.ok(typeof upd.row!.confirmed_at === "string");
  assert.deepEqual(Object.keys(upd.row!).sort(), ["confirmed_at", "confirmed_by", "status"]); // 열 권한 3칸만
  assert.ok(upd.filters.some(([k, v]) => k === "status" && v === "candidate")); // 동시에 두 번 눌러도 한 번만
  const a = auditOps.find((o) => o.op === "insert")!;
  assert.deepEqual(a.row, { actor_id: ADMIN, actor_role: "admin", action: "relation_confirm", target_table: "tech_relations", target_id: REL, reason: "공식 문서에서 대체 관계 확인" });
});

test("같은 역할 확정: 이미 확정이면 바꾸지도 기록하지도 않는다", async () => {
  const { c, userOps, auditOps } = ctx({ tech_relations: [{ id: REL, status: "confirmed", confirmed_at: "2026-11-19T00:00:00Z" }] });
  assert.deepEqual(await confirmRelation(c, REL, "다시 확인함"), { ok: true, changed: false, auditFailed: false });
  assert.equal(userOps.some((o) => o.op === "update"), false);
  assert.equal(auditOps.length, 0);
});

test("같은 역할 확정: 없는 줄·잘못된 id·짧은 사유는 DB를 바꾸지 않는다", async () => {
  const { c, userOps } = ctx({ tech_relations: [] });
  assert.deepEqual(await confirmRelation(c, REL, "공식 문서 확인"), { ok: false, code: "not_found" });
  assert.deepEqual(await confirmRelation(c, "not-a-uuid", "공식 문서 확인"), { ok: false, code: "not_found" });
  assert.deepEqual(await confirmRelation(c, REL, "짧음"), { ok: false, code: "reason" });
  assert.equal(userOps.some((o) => o.op === "update"), false);
});

test("불변 5: DB(RLS)가 막아 0줄이 바뀌면 실패로 알리고 바꾼 기록을 남기지 않는다", async () => {
  const { c, auditOps } = ctx({ tech_relations: [{ id: REL, status: "candidate" }], rule_lists: [{ id: RULE, enabled: true }] }, { blockWrites: true });
  assert.deepEqual(await confirmRelation(c, REL, "공식 문서 확인"), { ok: false, code: "failed" });
  assert.deepEqual(await setRuleEnabled(c, RULE, false, "오탐이 많아서 끔"), { ok: false, code: "failed" });
  assert.deepEqual(await addRule(c, { kind: "hn_keyword", ecosystem: "", value: "MCP" }, "새 낱말 추가함"), { ok: false, code: "failed" });
  assert.equal(auditOps.length, 0);
});

test("불변 4: 바꾸기는 됐는데 기록이 실패하면 되돌리지 않고 auditFailed로 알린다. 서버 연결이 없어도 같다", async () => {
  const a = ctx({ tech_relations: [{ id: REL, status: "candidate" }] }, {}, "fail");
  assert.deepEqual(await confirmRelation(a.c, REL, "공식 문서 확인"), { ok: true, changed: true, auditFailed: true });
  const b = ctx({ tech_relations: [{ id: REL, status: "candidate" }] }, {}, "none");
  assert.deepEqual(await confirmRelation(b.c, REL, "공식 문서 확인"), { ok: true, changed: true, auditFailed: true });
});

test("DB 오류 글은 결과에 담지 않는다(코드만)", async () => {
  const { c } = ctx({ tech_relations: [{ id: REL, status: "candidate" }] }, { fail: true });
  const r = await confirmRelation(c, REL, "공식 문서 확인");
  assert.deepEqual(r, { ok: false, code: "failed" });
  assert.equal(JSON.stringify(r).includes("내부 글"), false);
});

test("규칙 끄기·켜기: enabled와 고친 사람(나)만 바꾸고 사유를 남긴다. 같은 상태면 그대로", async () => {
  const rule = { id: RULE, kind: "hn_keyword", enabled: true, updated_by: null };
  const { c, userOps, auditOps } = ctx({ rule_lists: [rule] });
  assert.deepEqual(await setRuleEnabled(c, RULE, false, "오탐이 많아서 끔"), { ok: true, changed: true, auditFailed: false });
  assert.deepEqual(userOps.find((o) => o.op === "update")!.row, { enabled: false, updated_by: ADMIN });
  assert.equal(auditOps.find((o) => o.op === "insert")!.row!.action, "rule_disable");
  assert.deepEqual(await setRuleEnabled(c, RULE, false, "오탐이 많아서 끔"), { ok: true, changed: false, auditFailed: false });
  assert.equal((await setRuleEnabled(c, RULE, true, "다시 켬 확인")).ok, true);
  assert.equal(auditOps.filter((o) => o.op === "insert").at(-1)!.row!.action, "rule_enable");
});

test("규칙 추가: 검사한 값으로 넣고(고친 사람 = 나) 사유를 남긴다. 같은 규칙이 있으면 duplicate", async () => {
  const { c, userOps, auditOps } = ctx({ rule_lists: [] });
  const r = await addRule(c, { kind: "allow_package", ecosystem: "npm", value: " @scope/pkg " }, "공식 패키지라 허용");
  assert.deepEqual(r, { ok: true, changed: true, auditFailed: false });
  assert.deepEqual(userOps.find((o) => o.op === "insert")!.row, { kind: "allow_package", ecosystem: "npm", value: "@scope/pkg", updated_by: ADMIN });
  assert.equal(auditOps.find((o) => o.op === "insert")!.row!.action, "rule_add");
  const dup = ctx({ rule_lists: [] }, { insertCode: "23505" });
  assert.deepEqual(await addRule(dup.c, { kind: "hn_keyword", ecosystem: "", value: "MCP" }, "새 낱말 추가함"), { ok: false, code: "duplicate" });
  assert.deepEqual(await addRule(dup.c, { kind: "risk_pattern", ecosystem: "", value: "P9" }, "새 패턴 추가함"), { ok: false, code: "input" });
});
