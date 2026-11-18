// 운영 모드 응답에 붙는 보안 헤더(next.config.ts, PRD-NF8). 승인 버튼이 있는 화면이 남의 사이트 안에 끼워지지(클릭재킹) 않게 하고, 형식 추측을 막는다.
// 값을 통째로 베끼지 않고 지켜야 할 것만 확인한다(Referrer-Policy·Permissions-Policy는 있는지만).
import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.ts";

const env = process.env as Record<string, string | undefined>;

async function headersFor(nodeEnv: string | undefined) {
  const before = env.NODE_ENV;
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;
  try {
    return await nextConfig.headers!();
  } finally {
    if (before === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = before;
  }
}

test("운영 모드: 모든 경로에 보안 헤더 다섯 개가 붙고, 클릭재킹·형식 추측을 막는 값이다", async () => {
  const rules = await headersFor("production");
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/:path*");
  const headers = new Map(rules[0].headers.map((h) => [h.key, h.value]));
  assert.equal(headers.size, 5);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Content-Security-Policy") ?? "", /frame-ancestors 'none'/);
  assert.ok(headers.get("Referrer-Policy"));
  assert.ok(headers.get("Permissions-Policy"));
});

test("개발·시험: 헤더를 붙이지 않는다(내장 미리보기가 화면을 열 수 있어야 함)", async () => {
  for (const nodeEnv of ["development", "test", undefined]) assert.deepEqual(await headersFor(nodeEnv), []);
});
