import { test } from "node:test";
import assert from "node:assert/strict";
import { isPreviewUser, loginPreviewAllowed, loginPreviewOn, PREVIEW_USER } from "./login-preview.ts";

test("운영 빌드에서는 쿠키가 있어도 미리보기가 꺼진다(가짜 로그인이 운영에 새지 않게)", () => {
  assert.equal(loginPreviewAllowed({ NODE_ENV: "production" }), false);
  assert.equal(loginPreviewOn({ NODE_ENV: "production" }, "1"), false);
  // Vercel 위(미리보기 배포 포함)도 끈다
  assert.equal(loginPreviewOn({ NODE_ENV: "development", VERCEL_ENV: "preview" }, "1"), false);
});

test("개발 컴퓨터에서는 쿠키가 정확히 1일 때만 켜진다", () => {
  const dev = { NODE_ENV: "development" };
  assert.equal(loginPreviewAllowed(dev), true);
  assert.equal(loginPreviewOn(dev, "1"), true);
  for (const v of [undefined, "", "0", "true", "11"]) assert.equal(loginPreviewOn(dev, v), false);
});

test("가짜 계정은 일반 사용자이고, 다른 id는 미리보기로 보지 않는다", () => {
  assert.equal(PREVIEW_USER.role, "user");
  assert.equal(isPreviewUser(PREVIEW_USER), true);
  assert.equal(isPreviewUser({ id: "00000000-0000-4000-8000-000000000001" }), false);
  assert.equal(isPreviewUser(null), false);
});
