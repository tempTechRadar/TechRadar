// 같은 역할 처음 짝 시드 마이그레이션(P-14, ADR 0015)을 읽어 오타·중복·제약 위반을 먼저 잡는다. DB가 없어 SQL을 돌려 보지는 못한다:
// 문법과 실제 동작은 마이그레이션을 적용할 때 확인한다. 여기서는 목록과 값이 DB 제약(tech_a < tech_b·confirmed_at 필수)과 어긋나지 않는지만 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/202611191700_P-14_seed_same_role.sql", "utf8");

const quoted = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const techKeys = quoted(sql.match(/from \(values([\s\S]*?)\) as t\(tech_key\)/)?.[1] ?? "");
const pairValues = sql.match(/from \(values([\s\S]*?)\) as p\(key_a, key_b\)/)?.[1] ?? "";
const pairs = [...pairValues.matchAll(/\('([^']+)', '([^']+)'\)/g)].map((m) => [m[1], m[2]] as const);

test("확신 높음 14쌍을 넣는다", () => {
  assert.equal(pairs.length, 14);
});

test("짝에 나온 기술은 모두 기술 목록에 있어 먼저 만들어진다(오타가 있으면 그 짝만 조용히 빠지므로 여기서 잡는다)", () => {
  const known = new Set(techKeys);
  for (const [a, b] of pairs) {
    assert.ok(known.has(a), `${a}가 기술 목록에 없음`);
    assert.ok(known.has(b), `${b}가 기술 목록에 없음`);
  }
});

test("기술 목록에 중복이 없고 쓰이지 않는 기술도 없으며 모두 npm 키다", () => {
  assert.equal(new Set(techKeys).size, techKeys.length);
  const used = new Set(pairs.flat());
  assert.deepEqual(techKeys.filter((k) => !used.has(k)), []);
  assert.ok(techKeys.every((k) => k.startsWith("npm:")));
});

test("자기 자신과 짝짓지 않고 같은 짝(순서 무관)이 두 번 나오지 않는다", () => {
  assert.ok(pairs.every(([a, b]) => a !== b));
  const keys = pairs.map(([a, b]) => [a, b].sort().join(" | "));
  assert.equal(new Set(keys).size, keys.length);
});

test("관계 줄은 시드 확정이다: confirmed·seed·확정 시각 있음(DB 제약), 확정한 사람은 넣지 않고, 알림·변경 표는 건드리지 않는다", () => {
  const relationInsert = sql.slice(sql.indexOf("insert into public.tech_relations"));
  assert.match(relationInsert, /'same_role', 'confirmed'/);
  assert.match(relationInsert, /'seed', now\(\)/);
  assert.match(relationInsert, /\(tech_a, tech_b, kind, status, quote, made_by, confirmed_at\)/);
  assert.doesNotMatch(relationInsert, /confirmed_by/);
  assert.doesNotMatch(sql.replace(/--.*$/gm, ""), /\b(alerts|changes)\b/);
});

test("짝은 작은 id가 tech_a라는 DB 제약에 맞게 least/greatest로 넣고, 이미 확정된 짝은 건드리지 않는다", () => {
  assert.match(sql, /least\(a\.id, b\.id\), greatest\(a\.id, b\.id\)/);
  assert.match(sql, /on conflict \(tech_a, tech_b, kind\) do update[\s\S]*where public\.tech_relations\.status = 'candidate'/);
});
