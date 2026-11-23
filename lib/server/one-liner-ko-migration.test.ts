// P-12r 마이그레이션을 읽어 칸 · 제약 · 허용 값을 먼저 잡는다. DB가 없어 SQL은 못 돌린다: 실제 동작은 supabase/tests/one_liner_ko_p12r.sql 되돌림 시험으로 확인한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/202611240400_P-12r_one_liner_ko.sql", "utf8");
const body = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

test("technologies에 한국어 개요 칸 3개(길이 200 이하 제약 · 원문 src · 시각)만 더한다", () => {
  assert.match(body, /add column one_liner_ko text check \(one_liner_ko is null or char_length\(one_liner_ko\) <= 200\)/);
  assert.match(body, /add column one_liner_ko_src text/);
  assert.match(body, /add column one_liner_ko_at timestamptz/);
  assert.ok(!/\bdrop (column|table)\b|\bdelete from\b|\btruncate\b/i.test(body.replace(/drop constraint ai_calls_purpose_check/, "")), "추가만 한다");
});

test("ai_calls.purpose 허용 값을 넓힌다: 옛 값을 모두 두고 translate만 더한다", () => {
  assert.match(body, /purpose in \('draft', 'scenario', 'classify', 'chatbot', 'blueprint_check', 'translate'\)/);
});

test("새 칸에 사용자 쓰기 권한을 주지 않는다(grant 없음 — 쓰기는 서비스 키 경로만)", () => {
  assert.ok(!/\bgrant\b/i.test(body));
});
