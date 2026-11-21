import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectError } from "./collect-fetch.ts";
import { fetchSearchPage, searchUrl } from "./github-search-fetch.ts";

const TOKEN = "ghp_TESTTOKENTESTTOKENTESTTOKEN0123456789";
const realFetch = globalThis.fetch;
// 응답 하나를 흉내 내고, 받은 주소·머리글을 모은다
async function withFetch(status: number, body: string, fn: () => Promise<void>, headers: Record<string, string> = {}) {
  const seen: { url: string; auth: string | null }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, auth: new Headers(init.headers).get("authorization") });
    return new Response(body, { status, headers });
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
  return seen;
}
const ok = (over: Record<string, unknown> = {}) => JSON.stringify({ total_count: 0, incomplete_results: false, items: [], ...over });

test("검색 주소: 태그·별 하한(또는 구간)·별 순·100건씩, 토큰은 머리글에만", async () => {
  assert.equal(searchUrl({ tag: "mcp-server", upper: null, page: 2 }), "https://api.github.com/search/repositories?q=topic%3Amcp-server%20stars%3A%3E%3D1000&sort=stars&order=desc&per_page=100&page=2");
  assert.match(searchUrl({ tag: "mcp", upper: 4321, page: 1 }), /stars%3A1000\.\.4321&/);
  const seen = await withFetch(200, ok(), async () => void (await fetchSearchPage({ tag: "mcp", upper: null, page: 1 }, TOKEN)));
  assert.equal(seen[0].auth, `Bearer ${TOKEN}`);
  assert.ok(!seen[0].url.includes(TOKEN));
});

test("실제 크기의 응답(100건, 건당 7KB 안팎 = 70만 자 넘게)을 '응답이 너무 큼'으로 막지 않는다(11-21 실측 673,697자)", async () => {
  const one = (i: number) => ({
    full_name: `o${i}/r${i}`, html_url: `https://github.com/o${i}/r${i}`, description: "d".repeat(6_500), stargazers_count: 5000 - i, forks_count: 10,
    pushed_at: "2026-11-20T00:00:00Z", created_at: "2025-01-01T00:00:00Z", archived: false, fork: false, license: { spdx_id: "MIT" }, owner: { login: `o${i}`, type: "User" }, topics: ["mcp"],
  });
  const body = ok({ total_count: 100, items: Array.from({ length: 100 }, (_, i) => one(i)) });
  assert.ok(body.length > 650_000, `본문 ${body.length}자`);
  await withFetch(200, body, async () => assert.equal((await fetchSearchPage({ tag: "mcp", upper: null, page: 1 }, TOKEN)).items.length, 100));
});

test("후보 없음으로 단정하지 않는다: 결과가 다 안 나옴·모양 이상·404·422·한도 초과는 수집 오류", async () => {
  const q = { tag: "mcp" as const, upper: null, page: 1 };
  const cases: [number, string, string, Record<string, string>?][] = [
    [200, ok({ incomplete_results: true }), "timeout"], [200, "{}", "parse"], [404, "", "http_status"], [422, "{}", "http_status"], [403, "{}", "rate_limited", { "x-ratelimit-remaining": "0" }], [429, "{}", "rate_limited"],
  ];
  for (const [status, body, kind, headers] of cases) {
    await withFetch(status, body, () => assert.rejects(fetchSearchPage(q, TOKEN), (e: unknown) => e instanceof CollectError && e.kind === kind), headers);
  }
});
