import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// P-20c 경계: 시연 화면·버튼은 관리자만, ①②⑤는 시연 스위치가 켜졌을 때만. 시연 코드는 판단·알림을 직접 쓰지 않는다.
const page = readFileSync("app/admin/demo/page.tsx", "utf8");
const actions = readFileSync("app/admin/demo/actions.ts", "utf8");
const demoLib = ["lib/demo/demo-switch.ts", "lib/demo/judgment-hooks.ts", "lib/demo/demo-collectors.ts", "lib/server/action-record.ts"].map((p) => ({ p, text: readFileSync(p, "utf8") }));

test("시연 화면은 로그인·관리자 확인을 거친다", () => {
  assert.match(page, /getCurrentUser\(\)/);
  assert.match(page, /role !== "admin"/);
});

test("시연 서버 동작은 모두 관리자+스위치 확인(adminWithSwitch)을 먼저 부른다", () => {
  assert.match(actions, /role !== "admin"/);
  assert.match(actions, /isDemoSwitchEnabled\(process\.env\)/);
  const exported = [...actions.matchAll(/export async function (\w+)\(\)[^{]*\{([\s\S]*?)\n\}/g)];
  assert.ok(exported.length >= 4);
  for (const [, name, body] of exported) assert.match(body, /adminWithSwitch\(\)|runDemoBatch\(/, `${name}가 확인 없이 돈다`);
  assert.match(actions.match(/async function runDemoBatch[\s\S]*?\n\}/)?.[0] ?? "", /adminWithSwitch\(\)/);
});

test("시연 코드는 판단·알림·변경 표에 쓰지 않는다(진짜 사용자 영향 0, 불변 1)", () => {
  const writes = /from\(\s*["'`](judgments|alerts|changes)["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)/;
  assert.deepEqual(demoLib.filter(({ text }) => writes.test(text) || /save_judgment/.test(text)).map((f) => f.p), []);
  assert.equal(writes.test(actions), false);
});

test("수집 시연이 남기는 수집 자료는 모두 가짜 표시", () => {
  const collectors = demoLib.find((f) => f.p.endsWith("demo-collectors.ts"))!.text;
  const inserts = [...collectors.matchAll(/from\("observations"\)\.insert\(\{([\s\S]*?)\}\)/g)];
  assert.ok(inserts.length >= 1);
  for (const [, body] of inserts) assert.match(body, /is_simulated: true/);
});
