import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestLoginEnabled, readSupabasePublicConfig } from "./env.ts";

test("테스트 로그인은 운영 배포에서 플래그가 켜져 있어도 꺼진다", () => {
  assert.equal(isTestLoginEnabled({ VERCEL_ENV: "production", NEXT_PUBLIC_ENABLE_TEST_LOGIN: "true" }), false);
});

test("테스트 로그인은 미리보기·로컬에서 플래그가 true일 때만 켜진다", () => {
  assert.equal(isTestLoginEnabled({ VERCEL_ENV: "preview", NEXT_PUBLIC_ENABLE_TEST_LOGIN: "true" }), true);
  assert.equal(isTestLoginEnabled({ NEXT_PUBLIC_ENABLE_TEST_LOGIN: "true" }), true);
  assert.equal(isTestLoginEnabled({ NEXT_PUBLIC_ENABLE_TEST_LOGIN: "false" }), false);
  assert.equal(isTestLoginEnabled({}), false);
});

test("Supabase 공개 설정은 주소와 키가 둘 다 있어야 한다", () => {
  assert.equal(readSupabasePublicConfig({}), null);
  assert.equal(readSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }), null);
  assert.deepEqual(
    readSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }),
    { url: "https://x.supabase.co", anonKey: "k" },
  );
});

test("Supabase 주소는 프로젝트 주소만 쓴다: /rest/v1 같은 경로·끝 슬래시·공백은 떼어 낸다(로그인이 /rest/v1/auth/v1로 가지 않게)", () => {
  for (const raw of ["https://x.supabase.co/rest/v1", "https://x.supabase.co/rest/v1/", "https://x.supabase.co/", "  https://x.supabase.co  ", "https://x.supabase.co/auth/v1"]) {
    assert.equal(readSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: raw, NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" })?.url, "https://x.supabase.co", raw);
  }
});

test("Supabase 주소가 주소 모양이 아니면 연결 전(null)으로 본다", () => {
  assert.equal(readSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "x.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "k" }), null);
});
