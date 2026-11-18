import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanForLog, maskSecrets } from "./redact.ts";

// 아래 값은 모두 모양만 흉내 낸 가짜다.
const FAKE_GH = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";
const FAKE_SK = "sk-" + "abcdef1234567890";
const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZSJ9.c2lnbmF0dXJl";

test("GitHub 토큰·sk- 키·JWT는 모양만 보고 가린다", () => {
  for (const secret of [FAKE_GH, FAKE_SK, FAKE_JWT]) {
    const out = maskSecrets(`호출 실패: ${secret} 로 요청함`);
    assert.ok(!out.includes(secret), `가려지지 않음: ${secret.slice(0, 6)}`);
    assert.ok(out.includes("***"));
  }
});

test("KEY=·TOKEN: 뒤의 값은 이름이 달라도 가린다(이름은 남긴다)", () => {
  assert.equal(maskSecrets("SUPABASE_SERVICE_ROLE_KEY=abc123xyz"), "SUPABASE_SERVICE_ROLE_KEY=***");
  assert.equal(maskSecrets("GITHUB_TOKEN: abc123xyz, 다음"), "GITHUB_TOKEN: ***, 다음");
  assert.equal(maskSecrets('API_KEY="값 에 공백"'), "API_KEY=***");
});

test("주소 뒤 ?token=·&api_key= 값과 Bearer 값을 가린다", () => {
  assert.equal(maskSecrets("https://api.example.com/v1?q=1&api_key=zzz999&x=2"), "https://api.example.com/v1?q=1&api_key=***&x=2");
  assert.equal(maskSecrets("Authorization: Bearer abcdef123456"), "Authorization: Bearer ***");
});

test("평범한 글은 그대로 둔다(기술 키·주소·버전)", () => {
  const plain = "npm:mcp-remote 0.1.15 → GHSA-6xpm-ggf7-wc3p, https://osv.dev/v1/query, key=npm:mcp-remote";
  assert.equal(maskSecrets(plain), plain);
});

test("cleanForLog: 없으면 null, 가린 뒤 너무 길면 2000자에서 자른다", () => {
  assert.equal(cleanForLog(undefined), null);
  assert.equal(cleanForLog(`TOKEN=${FAKE_SK}`), "TOKEN=***");
  const long = cleanForLog("가".repeat(3000));
  assert.equal(long?.length, 2001);
  assert.ok(long?.endsWith("…"));
});
