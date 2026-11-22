import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { duplicateMigrationNumbers, LEGACY_DUPLICATES } from "./migration-numbers.ts";

test("마이그레이션 번호: 서로 다른 파일이 같은 12자리 번호를 쓰면 겹침으로 잡는다(이번 주 두 번 난 모양)", () => {
  const r = duplicateMigrationNumbers([
    "202611211200_P-12d_starter_set.sql", "202611211200_P-21a_github_search_source.sql", "202611211300_P-12d_starter_official.sql",
    "202611221300_P-12e_blueprint_checks.sql", "202611221300_P-12f_public_gallery_anon.sql", "202611221700_P-12f_news_items.sql",
  ]);
  assert.deepEqual(r, [
    { number: "202611211200", files: ["202611211200_P-12d_starter_set.sql", "202611211200_P-21a_github_search_source.sql"] },
    { number: "202611221300", files: ["202611221300_P-12e_blueprint_checks.sql", "202611221300_P-12f_public_gallery_anon.sql"] },
  ]);
});

test("마이그레이션 번호: 같은 파일이 두 번 들어와도(origin/main과 이 브랜치) 겹침이 아니고, 번호가 다르면 아무것도 안 잡는다", () => {
  assert.deepEqual(duplicateMigrationNumbers(["202611221700_P-12f_news_items.sql", "202611221700_P-12f_news_items.sql"]), []);
  assert.deepEqual(duplicateMigrationNumbers(["202611221300_a.sql", "202611221310_b.sql", "202611221400_c.sql"]), []);
  assert.deepEqual(duplicateMigrationNumbers([]), []);
});

test("마이그레이션 번호: 12자리 숫자로 시작하지 않는 이름은 무시한다(주석 파일 · 11자리 · 밑줄 없음)", () => {
  assert.deepEqual(duplicateMigrationNumbers(["README.md", "20261122130_a.sql", "20261122130_b.sql", "202611221300a.sql", "202611221300b.sql"]), []);
});

test("마이그레이션 번호: 규칙이 생기기 전 이미 적용된 겹침(11-19 P-12a2 · P-14) 두 파일만 허용하고, 같은 번호의 세 번째 파일 · 새 겹침은 잡는다", () => {
  const legacy = ["202611191700_P-12a2_nickname_using_now.sql", "202611191700_P-14_seed_same_role.sql"];
  assert.deepEqual(duplicateMigrationNumbers(legacy), []);
  assert.deepEqual(duplicateMigrationNumbers([...legacy, "202611191700_P-99_third.sql"]), [{ number: "202611191700", files: [...legacy, "202611191700_P-99_third.sql"].sort() }]);
  assert.deepEqual(duplicateMigrationNumbers([legacy[0], "202611191700_P-99_third.sql"]).length, 1, "허용 파일 하나와 새 파일이 겹쳐도 잡는다");
  assert.deepEqual([...LEGACY_DUPLICATES].sort(), legacy.sort());
  assert.equal(duplicateMigrationNumbers(["202611211200_a.sql", "202611211200_b.sql"]).length, 1);
});

test("마이그레이션 번호: 지금 이 저장소의 supabase/migrations에는 새 겹침이 없다", () => {
  assert.deepEqual(duplicateMigrationNumbers(readdirSync("supabase/migrations")), []);
});
