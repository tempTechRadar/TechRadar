// 사용자 연결이 my_technologies에 넣는 칸·값이 DB의 insert 제한(열 grant + origin 정책) 안에 드는지 묶어 둔다(I-P-11-my-tech 열린 질문 ③).
// 코드가 칸을 하나 더 보내거나 정책이 막는 값을 보내면 운영에서 저장이 깨지므로, 마이그레이션과 어긋나면 여기서 먼저 실패한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addTech } from "./my-tech.ts";
import { planRows } from "./local-import.ts";

const MIGRATION = "supabase/migrations/202611181900_P-11_my_tech_insert_columns.sql";
const UUID = "22222222-2222-4222-8222-222222222222";
const sql = readFileSync(MIGRATION, "utf8");

const list = (text: string) => text.split(",").map((item) => item.trim().replace(/^'|'$/g, ""));
const granted = list(sql.match(/^grant insert \(([^)]+)\) on public\.my_technologies to authenticated;$/m)?.[1] ?? "");
const allowedOrigins = list(sql.match(/origin in \(([^)]+)\)/)?.[1] ?? "");

// insert에 들어온 행을 기록만 하는 가짜 연결. addTech가 넣기 전에 읽는 "내 프로젝트(보관 안 함)" 조회에는 있다고 답한다.
function capturing(): { db: SupabaseClient; rows: Record<string, unknown>[] } {
  const rows: Record<string, unknown>[] = [];
  const q = { select: () => q, single: async () => ({ data: { id: "m1" }, error: null }) };
  const project = { eq: () => project, maybeSingle: async () => ({ data: { id: "p1", archived_at: null }, error: null }) };
  const db = { from: () => ({ insert: (row: Record<string, unknown>) => (rows.push(row), q), select: () => project }) } as unknown as SupabaseClient;
  return { db, rows };
}

function assertFits(rows: Record<string, unknown>[], who: string) {
  for (const row of rows) {
    for (const column of Object.keys(row)) assert.ok(granted.includes(column), `${who}가 ${column}을 보냄`);
    assert.ok(allowedOrigins.includes(row.origin as string), `${who}가 정책이 막는 origin ${String(row.origin)}을 보냄`);
  }
}

test("사용자 insert는 쓰는 7칸만 열려 있고, revoke가 grant보다 먼저라 나머지 칸이 닫힌다", () => {
  assert.deepEqual([...granted].sort(), ["added_by", "manual_name", "origin", "owner_id", "project_id", "tech_id", "version"]);
  const revoke = sql.indexOf("revoke insert on public.my_technologies from authenticated;");
  assert.ok(revoke >= 0 && revoke < sql.indexOf("grant insert ("), "revoke가 없거나 grant보다 뒤에 있음");
});

test("origin 정책은 사용자가 쓰는 manual·import만 허용하고 repo는 서버만 쓴다", () => {
  assert.deepEqual([...allowedOrigins].sort(), ["import", "manual"]);
});

test("직접 추가가 보내는 칸·origin은 모두 DB 제한 안에 있다", async () => {
  const { db, rows } = capturing();
  const audit = { from: () => ({ insert: async () => ({ error: null }) }) } as unknown as SupabaseClient;
  for (const techId of [UUID, null]) await addTech({ db, audit, userId: "u1" }, { projectId: UUID, techId, name: "내 도구", version: "1.0.0" });
  assert.equal(rows.length, 2);
  assertFits(rows, "직접 추가");
});

test("내 컴퓨터 가져오기가 보내는 칸·origin은 모두 DB 제한 안에 있다", () => {
  const items = [
    { kind: "mcp" as const, name: "mcp-remote", source: "import" as const, ecosystem: "npm" as const, pkg: "mcp-remote", version: "1.0.0" },
    { kind: "skill" as const, name: "내 스킬", source: "import" as const, pkg: "github.com/o/r/s" },
  ];
  const { rows } = planRows(items, new Map([["npm:mcp-remote", "t1"]]), [], { userId: "u1", projectId: "p1" });
  assert.equal(rows.length, 2);
  assertFits(rows, "가져오기");
});
