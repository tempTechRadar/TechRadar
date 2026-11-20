// 사용기 코드는 로그인한 사용자의 클라이언트로만 DB를 부르고(불변 5), 사용기 글은 Claude에 넣지 않고(SPEC), 글자 그대로 그린다(해석·실행 금지).
// 가짜 DB 시험은 이걸 못 보므로 소스를 훑는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FILES = [
  "app/projects/tech/[id]/usage-notes.tsx", "app/projects/tech/[id]/usage-note-form.tsx", "app/projects/tech/[id]/usage-note-buttons.tsx", "app/projects/tech/[id]/usage-actions.ts",
  "lib/server/usage-notes.ts", "lib/domain/usage-note.ts",
];
const text = (f: string) => readFileSync(f, "utf8");

test("사용기 코드는 서비스 키 클라이언트를 쓰지 않는다", () => {
  assert.deepEqual(FILES.filter((f) => /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY|service-supabase/.test(text(f))), []);
});

test("사용기 글은 Claude 코드에 넘어가지 않고, Claude 쪽 코드도 사용기를 읽지 않는다", () => {
  assert.deepEqual(FILES.filter((f) => /anthropic|generateDraft|generateScenario|ai_calls/i.test(text(f))), []);
  for (const f of ["lib/ai/build-draft-prompt.ts", "lib/ai/build-scenario-prompt.ts", "lib/server/generate-draft.ts", "lib/server/generate-scenario.ts"]) {
    try { assert.doesNotMatch(text(f), /usage_notes|usage-notes/, f); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  }
});

test("글은 글자 그대로 그린다: HTML로 해석하는 코드가 없다", () => {
  assert.deepEqual(FILES.filter((f) => /dangerouslySetInnerHTML|innerHTML|marked|markdown/i.test(text(f))), []);
});

test("서버 동작은 로그인 확인 없이 쓰지 않는다", () => {
  assert.match(text("app/projects/tech/[id]/usage-actions.ts"), /getCurrentUser\(\)[\s\S]*if \(!user\)/);
});
