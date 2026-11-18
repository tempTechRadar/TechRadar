import { test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_FAIL_SAVE_COOKIE_OPTIONS, isDemoSwitchEnabled, shouldFailSave } from "./demo-switch.ts";

test("시연 스위치는 운영 배포에서 플래그가 켜져 있어도 꺼진다", () => {
  assert.equal(isDemoSwitchEnabled({ VERCEL_ENV: "production", ENABLE_FAIL_DEMO: "true" }), false);
});

test("시연 스위치는 미리보기·로컬에서 ENABLE_FAIL_DEMO=true일 때만 켜진다", () => {
  assert.equal(isDemoSwitchEnabled({ VERCEL_ENV: "preview", ENABLE_FAIL_DEMO: "true" }), true);
  assert.equal(isDemoSwitchEnabled({ ENABLE_FAIL_DEMO: "true" }), true);
  for (const v of ["false", "1", "TRUE", "", undefined]) assert.equal(isDemoSwitchEnabled({ ENABLE_FAIL_DEMO: v }), false);
  // 브라우저에 노출되는 이름으로는 켜지지 않는다
  assert.equal(isDemoSwitchEnabled({ NEXT_PUBLIC_ENABLE_FAIL_DEMO: "true" }), false);
});

test("저장 실패는 스위치·시연 계정·쿠키 셋이 모두 맞을 때만", () => {
  const on = { ENABLE_FAIL_DEMO: "true" };
  assert.equal(shouldFailSave({ env: on, isDemo: true, cookie: "1" }), true);
  assert.equal(shouldFailSave({ env: on, isDemo: false, cookie: "1" }), false); // 진짜 사용자에게 영향 0
  assert.equal(shouldFailSave({ env: on, isDemo: true, cookie: undefined }), false);
  assert.equal(shouldFailSave({ env: on, isDemo: true, cookie: "0" }), false);
  assert.equal(shouldFailSave({ env: {}, isDemo: true, cookie: "1" }), false);
});

test("운영에서는 쿠키가 남아 있어도 아무 일도 일어나지 않는다", () => {
  assert.equal(shouldFailSave({ env: { VERCEL_ENV: "production", ENABLE_FAIL_DEMO: "true" }, isDemo: true, cookie: "1" }), false);
});

test("쿠키는 httpOnly·sameSite strict·10분", () => {
  assert.deepEqual(DEMO_FAIL_SAVE_COOKIE_OPTIONS, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 600 });
});
