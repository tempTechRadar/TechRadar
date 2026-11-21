// 로그인 화면 미리보기(개발용)는 가짜 계정이라 저장하는 서버 액션이 하나라도 그냥 돌면 가짜 id로 쓰게 된다(불변 1 · 4).
// 서버 액션은 Next에 묶여 직접 부르기 어려워 소스를 본다(guest-pages.test.ts와 같은 방식): 새 액션을 만들면 여기서 걸린다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** 저장하지 않는 액션(읽기 · 쿠키만). 관리자 액션은 가짜 계정이 일반 사용자라 관리자 확인에서 막힌다 */
const READ_ONLY = new Set(["searchAction", "searchCatalogAction", "findCapture", "recentAlerts", "dismissFirstCheck"]);

function serverActionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "admin" ? [] : serverActionFiles(p);
    return /\.tsx?$/.test(e.name) && readFileSync(p, "utf8").startsWith('"use server"') ? [p] : [];
  });
}

test("저장하는 서버 액션은 모두 DB · 서비스 키를 부르기 전에 미리보기를 막는다", () => {
  const files = serverActionFiles("app");
  assert.ok(files.length >= 10, "서버 액션 파일을 찾았다");
  let checked = 0;
  for (const f of files) {
    const s = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    for (const m of s.matchAll(/^export async function (\w+)[\s\S]*?\n\}/gm)) {
      if (READ_ONLY.has(m[1])) continue;
      const guard = m[0].indexOf("isLoginPreview()");
      const write = m[0].search(/getServerSupabase\(|getServiceSupabase\(|context\(\)|run\(/);
      assert.ok(guard > 0, `${f} ${m[1]}: isLoginPreview() 막기가 없다`);
      assert.ok(write < 0 || guard < write, `${f} ${m[1]}: DB보다 막기가 먼저여야 한다`);
      checked++;
    }
  }
  assert.ok(checked >= 15, `저장 액션 ${checked}개를 봤다`);
});
