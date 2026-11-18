import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// P-8 끝 기준: judgments는 로그인한 사용자 권한의 save_judgment로만 쓴다. 서비스 키(RLS를 건너뜀)로 쓰는 코드가 없어야 한다(spec 10-1, 불변 1).
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [path] : [];
  });
}

const sources = ["app", "lib"].flatMap((dir) => sourceFiles(dir)).map((path) => ({ path, text: readFileSync(path, "utf8") }));

test("judgments 표에 직접 쓰는 코드가 없다(쓰기는 save_judgment 함수로만)", () => {
  const writers = sources.filter(({ text }) => /from\(\s*["'`]judgments["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(text));

  assert.deepEqual(writers.map((s) => s.path), []);
});

test("서비스 키 클라이언트를 쓰는 파일은 판단 저장(save_judgment)을 부르지 않는다", () => {
  const offenders = sources.filter(({ text }) => /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY/.test(text) && /save_judgment/.test(text));

  assert.deepEqual(offenders.map((s) => s.path), []);
});
