// 취향·추천 화면과 서버 함수는 로그인한 사용자의 클라이언트로만 DB를 부른다(불변 5): 서비스 키 클라이언트를 쓰면
// RLS(본인 줄만)를 우회해 남의 취향을 읽을 수 있다. 가짜 DB 시험은 이걸 못 보므로 소스를 훑는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FILES = [
  "app/taste/actions.ts", "app/taste/page.tsx", "app/taste/taste-form.tsx", "app/recommend/page.tsx",
  "lib/server/taste-store.ts", "lib/server/recommend-queries.ts", "lib/domain/recommend.ts", "lib/domain/taste.ts",
];

test("취향·추천 코드는 서비스 키 클라이언트를 쓰지 않는다", () => {
  const bad = FILES.filter((f) => /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY|service-supabase/.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});

test("취향·추천 화면은 로그인 확인 없이 열리지 않는다", () => {
  for (const f of ["app/taste/page.tsx", "app/recommend/page.tsx", "app/taste/actions.ts"]) {
    assert.match(readFileSync(f, "utf8"), /getCurrentUser\(\)[\s\S]*if \(!user\) redirect\("\/login/, f);
  }
});

test("추천은 Claude에 넣지 않는다 (SPEC: 취향·추천은 Claude 밖)", () => {
  const bad = FILES.filter((f) => /anthropic|generateDraft|generateScenario|ai_calls/i.test(readFileSync(f, "utf8")));
  assert.deepEqual(bad, []);
});
