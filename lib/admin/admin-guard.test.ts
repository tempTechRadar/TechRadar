import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adminAccess } from "./admin-access.ts";

// P-18 끝 기준: 관리자 화면은 관리자만(PRD-F3, 불변 5), 판단 버튼 없음(불변 1).
// P-18b: 같은 역할 확정·규칙 고치기는 서버 동작(app/admin/classify/actions.ts)과 lib/server/classify-edit.ts에만 둔다.
function files(dir: string, re: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? files(p, re) : re.test(e.name) ? [p] : [];
  });
}
const read = (p: string) => ({ path: p.replaceAll("\\", "/"), text: readFileSync(p, "utf8") });
const adminPages = files("app/admin", /^page\.tsx$/).map(read);
const p18Files = [...files("app/admin", /\.tsx$/), ...files("lib/admin", /^(?!.*\.test\.ts$).*\.ts$/), "lib/server/admin-queries.ts", "lib/server/admin-gate.ts"]
  .map(read)
  .filter((f) => !/app\/admin\/(flow|simulator)\//.test(f.path)); // 흐름·시뮬레이터는 다른 조각(P-6·P-5)

test("adminAccess: 로그인 전은 login, 일반 계정은 forbidden, 관리자만 ok", () => {
  assert.equal(adminAccess(null), "login");
  assert.equal(adminAccess({ role: "user" }), "forbidden");
  assert.equal(adminAccess({ role: "" }), "forbidden");
  assert.equal(adminAccess({ role: "admin" }), "ok");
});

test("관리자 화면(page.tsx)은 모두 관리자 확인을 거친다", () => {
  assert.ok(adminPages.length >= 7, `관리자 화면이 ${adminPages.length}개뿐`);
  const open = adminPages.filter(({ text }) => !/adminGate\(\)/.test(text) && !(/getCurrentUser\(\)/.test(text) && /role !== "admin"/.test(text)));
  assert.deepEqual(open.map((f) => f.path), []);
});

test("P-18 화면·읽기 코드에는 판단 저장·쓰기 코드가 없다(판단 버튼 없음)", () => {
  const bad = p18Files.filter(({ text }) => /save_judgment|saveJudgment|from\(\s*["'`]judgments["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)/.test(text));
  assert.deepEqual(bad.map((f) => f.path), []);
});

test("P-18b: 분류 확인의 서버 동작은 동작마다 관리자 확인(adminGate)을 다시 거친다(화면만 믿지 않음, 불변 5)", () => {
  const { text } = read("app/admin/classify/actions.ts");
  assert.match(text, /^["']use server["']/);
  const actions = [...text.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)];
  assert.ok(actions.length >= 3, `서버 동작이 ${actions.length}개뿐`);
  const open = actions.filter(([, , body]) => !/await adminGate\(\)/.test(body)).map(([, name]) => name);
  assert.deepEqual(open, []);
});

test("P-18b: 규칙·같은 역할 바꾸기는 관리자 본인 연결로만, 서비스 키 연결은 바꾼 기록(audit_logs)에만 쓴다", () => {
  const { text } = read("lib/server/classify-edit.ts");
  assert.doesNotMatch(text, /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY|service-supabase/);
  const auditTables = [...text.matchAll(/audit\s*\.\s*from\(\s*["'`](\w+)["'`]/g)].map((m) => m[1]);
  assert.ok(auditTables.length > 0);
  assert.deepEqual([...new Set(auditTables)], ["audit_logs"]);
  assert.doesNotMatch(text, /db\s*\.\s*from\(\s*["'`]audit_logs/);
});

test("P-18 읽기 화면·읽기 코드는 쓰지 않는다: 쓰기는 classify-edit와 서버 동작에만 있다", () => {
  const writes = /\.\s*(insert|update|upsert|delete)\s*\(/;
  const bad = p18Files.filter(({ text }) => writes.test(text) || /["']use server["']/.test(text));
  assert.deepEqual(bad.map((f) => f.path), []);
});

test("P-18 코드는 서비스 키 클라이언트를 쓰지 않는다(RLS가 관리자 권한으로 한 번 더 막게)", () => {
  const bad = p18Files.filter(({ text }) => /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY|service-supabase/.test(text));
  assert.deepEqual(bad.map((f) => f.path), []);
});

test("수집 실행 화면의 '지금 한 번 실행'은 꺼진 자리가 아니라 실제 화면(/admin/run-now)으로 가는 링크다", () => {
  const { text } = read("app/admin/runs/body.tsx"); // 화면 그림은 body.tsx(I-admin-unify: 페이지는 읽기 · 권한만)
  assert.match(text, /<Link href="\/admin\/run-now"[^>]*>지금 한 번 실행<\/Link>/);
  assert.doesNotMatch(text, /<button[^>]*disabled[^>]*>지금 한 번 실행/);
  assert.doesNotMatch(text, /조각\(P-17\)이 붙으면 켜져요/);
});

test("실패 시연 안내는 ADR 0016과 같다: 관리자도 자기 알림은 판단할 수 있다고 쓰고, '관리자는 판단할 수 없'다고 쓰지 않는다", () => {
  const { text } = read("app/admin/demo/body.tsx"); // 안내 문구는 body.tsx(I-admin-unify)
  assert.doesNotMatch(text, /관리자는 판단할 수 없/);
  assert.match(text, /자기 알림/);
});
