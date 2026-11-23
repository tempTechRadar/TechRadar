// 로그인 전에 눌러도 되는 화면(11-21 "같은 메뉴"): 알림 · 기록은 로그인 확인보다 먼저 DB를 부르지 않고 안내(LoginNeeded)를 보인다(불변 5).
// 화면 컴포넌트는 서버 · Next에 묶여 가짜 DB 시험이 어려워 소스 순서를 본다(taste-scan.test.ts와 같은 방식)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 옛 내 프로젝트(/projects)는 /dashboard로 보내기만 한다(P-12i D3). 보드는 로그인 전에 레포 관리 위젯을 그리지 않는다(page.tsx Guest)
test("로그인 전 알림 · 기록 · 설정 · 레포 상세는 DB를 부르기 전에 로그인 안내로 끝난다", () => {
  for (const f of ["app/alerts/page.tsx", "app/history/page.tsx", "app/settings/page.tsx", "app/projects/[id]/page.tsx"]) {
    const s = readFileSync(f, "utf8");
    const guard = s.search(/if \(!user\) return <LoginNeeded/), db = s.indexOf("getServerSupabase()");
    assert.ok(guard > 0, `${f}: 로그인 안내가 있다`);
    assert.ok(db > guard, `${f}: DB는 로그인 확인 뒤에`);
  }
});
// 옛 /views · /new는 P-12f에서 보내기만 하는 화면이 됐다(lib/nav/moved.test.ts)
