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

test("판단 서버 동작은 saveJudgment에 사용자 클라이언트만 넘기고, 서비스 클라이언트는 조치 기록(recordActionOutcome)에만 쓴다", () => {
  const action = sources.find(({ path }) => path.replaceAll("\\", "/").endsWith("app/alerts/[id]/actions.ts"));

  assert.ok(action, "app/alerts/[id]/actions.ts를 찾지 못함");
  assert.match(action.text, /saveJudgment\(\s*picked\.db\s*,/, "saveJudgment의 첫 인자는 사용자 클라이언트(picked.db)여야 한다");
  const serviceVars: string[] = [...action.text.matchAll(/const\s+(\w+)\s*=\s*getServiceSupabase\(\)/g)].map((m) => m[1]);
  assert.ok(serviceVars.length > 0, "조치 기록용 서비스 클라이언트가 있어야 한다");
  for (const name of serviceVars) {
    const stray: string[] = action.text
      .split("\n")
      .filter((line) => line.includes(name))
      .filter((line) => !line.includes("getServiceSupabase()") && !line.includes(`recordActionOutcome(${name},`));
    assert.deepEqual(stray, [], `${name}는 선언과 recordActionOutcome의 인자로만 쓰여야 한다`);
  }
});
