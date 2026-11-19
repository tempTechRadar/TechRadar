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

test("cleanForLog: 믿을 수 없는 긴 글(KEY가 이어진 대문자 덩어리)도 오래 걸리지 않는다 — 가리기 전에 자르므로 글자 수의 제곱으로 느려지지 않는다", () => {
  const started = performance.now();
  const out = cleanForLog(`다른 파일(${"KEY".repeat(40_000)})`);
  assert.equal(out?.length, 2001); // 잘렸다는 표시(…)까지
  assert.ok(out?.endsWith("…"));
  // 옛 코드는 12만 자에서 수 초(제곱)였다. 넉넉히 잡는다
  assert.ok(performance.now() - started < 2_000, `너무 오래 걸림: ${(performance.now() - started).toFixed(0)}ms`);
});

test("cleanForLog: 앞쪽 비밀값은 자르기 전에도 가려지고, 가려서 줄어든 글도 뒤가 잘렸다면 표시가 붙는다", () => {
  assert.equal(cleanForLog(`TOKEN=${FAKE_SK} ${"x".repeat(5_000)}`), `TOKEN=*** ${"x".repeat(1_990)}…`);
  // 미리 자른 4000자 안에서 가려져 2000자 아래로 줄어도, 원래 글이 더 길었다는 표시는 남는다
  assert.equal(cleanForLog(`MY_TOKEN=${"a".repeat(3_000)} ${"y".repeat(5_000)}`), `MY_TOKEN=*** ${"y".repeat(990)}…`);
});

test("소문자 머리글(x-api-key:·authorization: bearer)과 JSON 칸 값을 가린다(이름은 남긴다)", () => {
  assert.equal(maskSecrets("x-api-key: abc123xyz"), "x-api-key: ***");
  assert.equal(maskSecrets('curl -H "x-api-key: abc123xyz" https://api.example.com'), 'curl -H "x-api-key: ***" https://api.example.com');
  assert.equal(maskSecrets("authorization: bearer abcdef123456"), "authorization: bearer ***");
  assert.equal(maskSecrets("Authorization: Basic dXNlcjpwYXNz"), "Authorization: Basic ***");
  assert.equal(maskSecrets('{"api_key":"abc123xyz","name":"demo"}'), '{"api_key":"***","name":"demo"}');
});

test("명령 옵션 --token 값·--token=값·--api-key 값을 가린다(옵션 이름은 남긴다)", () => {
  assert.equal(maskSecrets("npx tool --token abc123xyz --verbose"), "npx tool --token *** --verbose");
  assert.equal(maskSecrets("npx tool --token=abc123xyz"), "npx tool --token=***");
  assert.equal(maskSecrets("npx tool --api-key abc123xyz"), "npx tool --api-key ***");
  // 따옴표 값은 따옴표를 남기고 안만 가린다(JSON 칸과 같은 모양)
  assert.equal(maskSecrets("gh auth --auth-token 'abc 123'"), "gh auth --auth-token '***'");
});

test("cleanForLog(실행 기록 요약·오류)도 소문자 머리글·옵션 값을 가린다", () => {
  assert.equal(cleanForLog("mcp-remote 실행 실패: --token abc123xyz"), "mcp-remote 실행 실패: --token ***");
  assert.equal(cleanForLog("401 x-api-key: abc123xyz"), "401 x-api-key: ***");
});

test("값이 없는 평범한 글은 그대로 둔다(token 낱말·한국어 문장·옵션 이름만·비밀 없는 주소)", () => {
  const plain = [
    "the token expired, please log in again",
    "토큰(token)이 만료되었어요. password 칸을 다시 확인하세요",
    // "password: 8자"처럼 콜론 바로 뒤 값에 한국어가 붙으면 앞 덩어리("8")는 가린다(값 뒤에 한국어가 붙은 비밀값을 놓치지 않으려고)
    "password 칸은 8자 이상으로 정하세요",
    "--token 옵션은 쓰지 마세요",
    "npx tool --token-file ./secret.txt --no-token --verbose",
    "npx tool --keyword search",
    "https://api.example.com/v1/tokens?page=2&sort=name",
    "key=npm:mcp-remote 0.1.15",
  ];
  for (const text of plain) assert.equal(maskSecrets(text), text);
});

test("[검토] 값 바로 뒤에 한국어·<·( 가 붙어도 값은 가린다", () => {
  assert.equal(maskSecrets("x-api-key: abc123xyz가 잘못됨"), "x-api-key: ***가 잘못됨");
  assert.equal(maskSecrets("--token=abc123xyz에서 실패"), "--token=***에서 실패");
  assert.equal(maskSecrets("x-api-key: abc123<br>"), "x-api-key: ***<br>");
  assert.equal(maskSecrets("token: abc123xyz(만료)"), "token: ***(만료)");
});

test("[검토] 앞에 다른 낱말이 붙은 소문자 이름(client_secret·refresh_token·github_token·private_key·db_password)도 가린다", () => {
  assert.equal(maskSecrets('{"client_secret":"abc123xyz"}'), '{"client_secret":"***"}');
  assert.equal(maskSecrets("refresh_token: abc123xyz"), "refresh_token: ***");
  assert.equal(maskSecrets("github_token: abc123xyz"), "github_token: ***");
  assert.equal(maskSecrets("private_key: abc123xyz"), "private_key: ***");
  assert.equal(maskSecrets("db_password: abc123xyz"), "db_password: ***");
});

test("[검토] 따옴표 값은 띄어쓰기가 있어도 통째로 가린다", () => {
  assert.equal(maskSecrets('{"password":"my pass word"}'), '{"password":"***"}');
  assert.equal(maskSecrets("password: 'my pass word'"), "password: '***'");
  assert.equal(maskSecrets('{"authorization":"Bearer abc def"}'), '{"authorization":"***"}');
});

test("[검토] 소문자 이름 뒤 = 도 값으로 본다", () => {
  assert.equal(maskSecrets("api_key=abc123xyz npx tool"), "api_key=*** npx tool");
  assert.equal(maskSecrets("password=hunter2"), "password=***");
});

test("[검토] 옵션 값이 -로 시작해도 가린다(다음 --옵션은 값이 아님)", () => {
  assert.equal(maskSecrets("--token -AbC123xyz"), "--token ***");
  assert.equal(maskSecrets("--token --verbose"), "--token --verbose");
});

test("[검토] 잘못 가리지 않는다: --monkey, 줄바꿈 뒤 글, 개수 칸, JSON 오류, 자리표시자", () => {
  const plain = [
    "--monkey banana",
    "--password\nnext line",
    "--token\n--verbose",
    '{"tokens_in":12,"tokens_out":5}',
    '{"tech_key":"npm:mcp-remote","dedupe_key":"abc"}',
    "Unexpected token } in JSON at position 3",
    "SyntaxError: Unexpected token: }",
    "npx tool --api-key $API_KEY",
    "npx tool --api-key ${API_KEY}",
    "password: <your-password>",
    "token: {{TOKEN}}",
    '{"api_key":"$API_KEY"}',
    "x-api-key: ${X_API_KEY}",
  ];
  for (const text of plain) assert.equal(maskSecrets(text), text);
});
