// 사용기 신고 관리자 화면(P-24 24b): 화면·동작이 관리자 확인을 거치고, 서비스 키 연결은 바꾼 기록(audit_logs)에만 쓰고,
// 쓴 사람·신고한 사람을 읽지 않고, 글을 해석하지 않고, Claude에 넣지 않는다. 가짜 DB 시험은 이걸 못 보므로 소스를 훑는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const text = (f: string) => readFileSync(f, "utf8");
const FILES = ["app/admin/reports/page.tsx", "app/admin/reports/actions.ts", "app/admin/reports/report-forms.tsx", "app/admin/reports/report-card.tsx", "lib/server/moderation-edit.ts", "lib/admin/report-groups.ts"];

test("신고 화면은 관리자 관문을 거치고, 서버 동작마다 관리자 확인을 다시 한다", () => {
  assert.match(text("app/admin/reports/page.tsx"), /adminGate\(\)[\s\S]*"blocked" in gate/);
  const actions = text("app/admin/reports/actions.ts");
  assert.match(actions, /ctxOf\(await adminGate\(\)\)/);
  const exported = [...actions.matchAll(/export async function (\w+)/g)].length;
  assert.equal([...actions.matchAll(/ctxOf\(await adminGate\(\)\)/g)].length, exported);
});

test("서비스 키 연결은 바꾼 기록(audit)에만 쓴다: 글·신고를 바꾸는 코드는 관리자 본인 연결", () => {
  const edit = text("lib/server/moderation-edit.ts");
  assert.doesNotMatch(edit, /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY/);
  const actions = text("app/admin/reports/actions.ts");
  assert.match(actions, /audit: getServiceSupabase\(\)/);
  assert.equal([...actions.matchAll(/getServiceSupabase/g)].length, 2); // import 한 줄 + ctxOf 한 곳
});

test("쓴 사람·신고한 사람·숨긴 사람을 읽거나 그리지 않는다", () => {
  const code = (f: string) => text(f).replace(/\/\/.*$/gm, "");
  // 쓴 사람·신고한 사람 칸은 어디에도 나오지 않는다
  assert.deepEqual(FILES.filter((f) => /author_id|reporter_id|authorId|reporterId/.test(code(f))), []);
  // 숨긴 사람 칸(hidden_by)은 숨길 때 나를 적는 쓰기에만 나오고, 읽는 칸 목록(select)에는 없다
  assert.deepEqual(FILES.filter((f) => /select\(\s*["'`][^"'`]*hidden_by/.test(code(f))), []);
});

test("글은 글자 그대로 그린다: HTML로 해석하는 코드가 없고 Claude 코드에 넘기지 않는다", () => {
  assert.deepEqual(FILES.filter((f) => /dangerouslySetInnerHTML|innerHTML|marked|markdown/i.test(text(f))), []);
  assert.deepEqual(FILES.filter((f) => /anthropic|generateDraft|generateScenario|ai_calls/i.test(text(f))), []);
});

test("새 탭이 관리자 메뉴에 있다", () => {
  assert.match(text("app/admin/admin-shell.tsx"), /id: "reports", href: "\/admin\/reports", label: "사용기 신고"/);
});
