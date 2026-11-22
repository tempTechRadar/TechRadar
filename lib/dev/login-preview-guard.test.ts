// 로그인 화면 미리보기(개발용)는 가짜 계정이라 저장하는 서버 액션이 하나라도 그냥 돌면 가짜 id로 쓰게 된다(불변 1 · 4).
// 서버 액션은 Next에 묶여 직접 부르기 어려워 소스를 본다(guest-pages.test.ts와 같은 방식): 새 액션을 만들면 여기서 걸린다.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/** 저장하지 않는 액션(읽기 · 쿠키만). 관리자 액션은 가짜 계정이 일반 사용자라 관리자 확인에서 막힌다 */
const READ_ONLY = new Set(["searchCatalogAction", "recentAlerts", "dismissFirstCheck"]);

/** app 아래 파일 중 pick이 고른 것. 관리자 폴더는 뺀다: 가짜 계정은 일반 사용자라 관리자 확인에서 막힌다(admin-guard.test.ts) */
function appFiles(dir: string, pick: (name: string, path: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === "admin" ? [] : appFiles(p, pick);
    return pick(e.name, p) ? [p] : [];
  });
}
const serverActionFiles = (dir: string) => appFiles(dir, (n, p) => /\.tsx?$/.test(n) && readFileSync(p, "utf8").startsWith('"use server"'));

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

// 화면도 같다: 미리보기 계정으로 DB를 부르면 Supabase 설정이 없는 개발 컴퓨터에서 화면이 깨졌다(/projects, I-P-12d-ui-sweep)
// shortcut: 글자 순서만 본다(거르기가 DB 호출을 정말 건너뛰는지, lib 함수 안에서 DB를 여는 화면은 못 봄). 화면이 늘어 새면 getServerSupabase가 미리보기 계정을 거부하게 옮긴다
test("DB 클라이언트를 만드는 화면은 모두 그 전에 미리보기 계정을 거른다", () => {
  const files = appFiles("app", (n, p) => n === "page.tsx" && readFileSync(p, "utf8").includes("getServerSupabase()"));
  assert.ok(files.length >= 15, `DB를 읽는 화면 ${files.length}개를 찾았다`);
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    const guard = s.indexOf("isPreviewUser(user)"), db = s.indexOf("getServerSupabase()");
    assert.ok(guard > 0, `${f}: 미리보기 거르기가 없다`);
    assert.ok(guard < db, `${f}: DB보다 거르기가 먼저여야 한다`);
  }
});
