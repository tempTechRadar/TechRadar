import assert from "node:assert/strict";
import test from "node:test";
import { afterLoginPath } from "./after-login.ts";

// IA-1: 가입 직후(임시 별명)에는 별명을 정하는 설정 화면으로, 그 밖에는 가려던 곳으로.
const ID = "5ed12543-734b-4447-9811-80e947a1401b";

test("임시 별명이면 설정(환영)으로 보내고, 가려던 곳을 next로 실어 둔다", () => {
  assert.equal(afterLoginPath("/dashboard", "user-5ed12543", ID), "/settings?welcome=1&next=%2Fdashboard");
  assert.equal(afterLoginPath("/alerts?status=pending", "user-5ed12543", ID), "/settings?welcome=1&next=%2Falerts%3Fstatus%3Dpending");
});

test("가려던 곳이 첫 화면(/)이면 next를 싣지 않는다", () => {
  assert.equal(afterLoginPath("/", "user-5ed12543", ID), "/settings?welcome=1");
});

test("별명을 이미 정한 사람은 가려던 곳으로 간다", () => {
  assert.equal(afterLoginPath("/dashboard", "레이더맨", ID), "/dashboard");
});

test("별명을 읽지 못했으면(null) 가려던 곳으로 보낸다(로그인을 막지 않음)", () => {
  assert.equal(afterLoginPath("/dashboard", null, ID), "/dashboard");
});
