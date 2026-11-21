// 입문 세트 시드 마이그레이션(I-P-12d-starter-set)을 읽어 오타 · 중복 · 제약 위반을 먼저 잡는다(seed-same-role-migration.test.ts와 같은 방식).
// DB가 없어 SQL을 돌려 보지는 못한다: 실제 동작은 supabase/tests/starter_set_p12d.sql 되돌림 시험으로 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORY_SEED } from "../map/classify.ts";

const sql = readFileSync("supabase/migrations/202611211200_P-12d_starter_set.sql", "utf8");
const values = sql.match(/from \(values([\s\S]*?)\n\) as v\(/)?.[1] ?? "";
const field = String.raw`('[^']*'|null)`;
const rowRe = new RegExp(String.raw`\(${Array(8).fill(field).join(", ")}\)`, "g");
const rows = [...values.matchAll(rowRe)].map((m) => m.slice(1).map((x) => (x === "null" ? null : x.slice(1, -1))));
const TYPES = ["mcp", "skill", "plugin", "sdk", "model", "service", "concept"]; // technologies.type 제약

test("45줄: 개념 14 · 스킬 10 · 플러그인 6 · 도구 15", () => {
  assert.equal(rows.length, 45);
  const count = (t: string) => rows.filter((r) => r[2] === t).length;
  assert.deepEqual([count("concept"), count("skill"), count("plugin"), count("sdk")], [14, 10, 6, 15]);
});

test("키는 겹치지 않고 종류와 앞머리가 맞으며, 종류는 DB 제약 안에 있다", () => {
  const keys = rows.map((r) => r[0]!);
  assert.equal(new Set(keys).size, keys.length);
  for (const [key, , type] of rows) {
    assert.ok(TYPES.includes(type!), `${key}: 종류 ${type}`);
    const prefix = { concept: /^concept:[a-z-]+$/, skill: /^skill:anthropics\/skills\/[a-z-]+$/, plugin: /^plugin:anthropics\/claude-plugins-official\/[a-z-]+$/, sdk: /^(npm|pypi):[@a-z0-9/._-]+$/ }[type as "concept" | "skill" | "plugin" | "sdk"];
    assert.match(key!, prefix, `${key}: 키 모양`);
  }
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

test("코드가 이미 쓰는 개념 키(harness · subagents · slash-commands)와 같은 키를 쓴다", () => {
  const keys = new Set(rows.map((r) => r[0]));
  for (const k of ["concept:harness", "concept:subagents", "concept:slash-commands"]) assert.ok(keys.has(k), k);
});
