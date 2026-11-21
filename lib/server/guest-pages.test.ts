// 로그인 전에 눌러도 되는 화면(11-21 "같은 메뉴"): 내 레이더 · 알림 · 기록은 로그인 확인보다 먼저 DB를 부르지 않고 안내(LoginNeeded)를 보인다(불변 5).
// 화면 컴포넌트는 서버 · Next에 묶여 가짜 DB 시험이 어려워 소스 순서를 본다(taste-scan.test.ts와 같은 방식)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("로그인 전 내 레이더 · 알림 · 기록은 DB를 부르기 전에 로그인 안내로 끝난다", () => {
  for (const f of ["app/views/page.tsx", "app/alerts/page.tsx", "app/history/page.tsx"]) {
    const s = readFileSync(f, "utf8");
    const guard = s.search(/if \(!user\) return <LoginNeeded/), db = s.indexOf("getServerSupabase()");
    assert.ok(guard > 0, `${f}: 로그인 안내가 있다`);
    assert.ok(db > guard, `${f}: DB는 로그인 확인 뒤에`);
  }
});

test("로그인 전 새 기술은 서비스 키로 읽지만 내 표시를 읽는 길(로그인한 사람의 클라이언트)과 나뉘어 있다", () => {
  const s = readFileSync("app/new/page.tsx", "utf8");
  assert.match(s, /readNewTechs\(db, null,/, "로그인 전은 사용자 없이(null)");
  assert.match(s, /user \? readNewTechs\(\(await getServerSupabase\(\)\)!, user\.id/, "로그인 뒤는 본인 클라이언트로");
});
