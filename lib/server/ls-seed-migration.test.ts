// LS점프업 시드 마이그레이션(I-P-12p-seed)을 읽어 오타 · 중복 · 제약 위반을 먼저 잡는다(starter-set-migration.test.ts와 같은 방식).
// DB가 없어 SQL을 돌려 보지는 못한다: 실제 동작은 supabase/tests/ls_seed_p12p.sql 되돌림 시험으로 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORY_SEED } from "../map/classify.ts";

const sql = readFileSync("supabase/migrations/202611240200_P-12p_ls_seed.sql", "utf8");
const values = sql.match(/from \(values([\s\S]*?)\n\) as v\(/)?.[1] ?? "";
const field = String.raw`('[^']*'|null)`;
const rowRe = new RegExp(String.raw`\(${Array(8).fill(field).join(", ")}\)`, "g");
const rows = [...values.matchAll(rowRe)].map((m) => m.slice(1).map((x) => (x === "null" ? null : x.slice(1, -1))));
const TYPES = ["mcp", "skill", "plugin", "sdk", "model", "service", "concept"]; // technologies.type 제약

test("2줄: herdr(sdk) · 루프 하네스(concept), 키는 겹치지 않고 종류는 DB 제약 안에 있다", () => {
  assert.deepEqual(rows.map((r) => [r[0], r[2]]), [["github:herdrdev/herdr", "sdk"], ["concept:loop-harness", "concept"]]);
  for (const r of rows) assert.ok(TYPES.includes(r[2]!), `${r[0]}: 종류 ${r[2]}`);
});

test("herdr 키는 GitHub 수집기가 읽는 소문자 github:<소유자>/<저장소>이고 repo_url과 같은 저장소다", () => {
  const [key, , , , , , repoUrl] = rows[0];
  assert.match(key!, /^github:[a-z0-9_.-]+\/[a-z0-9_.-]+$/);
  assert.equal(repoUrl, `https://github.com/${key!.slice("github:".length)}`);
});

test("갈래 이름은 모두 갈래 시드에 있다(오타면 갈래가 조용히 비므로 여기서 잡는다)", () => {
  const names = new Set(CATEGORY_SEED.flatMap((c) => [c.name, ...c.smalls.map((k) => k.name)]));
  for (const [key, , , cat] of rows) assert.ok(names.has(cat!), `${key}: 갈래 ${cat}`);
});

test("한 줄 설명과 근거(https)가 모두 있고, 한 줄은 짧다", () => {
  for (const [key, , , , oneLiner, source] of rows) {
    assert.ok(oneLiner && oneLiner.length <= 40, `${key}: 한 줄 길이 ${oneLiner?.length}`);
    assert.match(source!, /^https:\/\//, `${key}: 근거 주소`);
  }
});

test("새 줄은 NEW · 적용 기회 알림에서 빠지고(registry_backfill), 이미 있는 줄은 이름 · 종류 · 상태를 건드리지 않는다", () => {
  assert.ok(sql.includes(`'{"registry_backfill": true, "ls_seed": true}'::jsonb`));
  const conflict = sql.slice(sql.indexOf("on conflict (tech_key) do update set"));
  for (const col of ["display_name", "type", "status", "grade"]) assert.ok(!new RegExp(String.raw`^\s*${col}\s*=`, "m").test(conflict), `${col}을 덮어쓰지 않는다`);
});

test("기존 개념 키(concept:harness = 지침 파일)와 겹치지 않는다", () => {
  assert.ok(!rows.some((r) => r[0] === "concept:harness"));
});
