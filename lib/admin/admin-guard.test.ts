import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { adminAccess } from "./admin-access.ts";

// P-18 끝 기준: 관리자 화면은 관리자만(PRD-F3, 불변 5), 판단 버튼 없음(불변 1), 규칙 고치기는 이번엔 자리만.
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

test("P-18은 아직 쓰지 않는다: 규칙·같은 역할·감사 기록에 쓰는 코드와 서버 동작이 없다", () => {
  const writes = /\.\s*(insert|update|upsert|delete)\s*\(/;
  const bad = p18Files.filter(({ text }) => writes.test(text) || /["']use server["']/.test(text));
  assert.deepEqual(bad.map((f) => f.path), []);
});

test("P-18 코드는 서비스 키 클라이언트를 쓰지 않는다(RLS가 관리자 권한으로 한 번 더 막게)", () => {
  const bad = p18Files.filter(({ text }) => /getServiceSupabase|SUPABASE_SERVICE_ROLE_KEY|service-supabase/.test(text));
  assert.deepEqual(bad.map((f) => f.path), []);
});
