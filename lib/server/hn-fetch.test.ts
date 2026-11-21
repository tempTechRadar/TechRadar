import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectError } from "./collect-fetch.ts";
import { fetchHnHits, hnSearchUrl } from "./hn-fetch.ts";

const NOW = Date.parse("2026-11-21T00:00:00Z");

test("주소: 글만, 최근 7일, 10점 이상, 한 쪽 1000개", () => {
  const u = new URL(hnSearchUrl("model context protocol", NOW));
  assert.equal(u.origin + u.pathname, "https://hn.algolia.com/api/v1/search_by_date");
  assert.equal(u.searchParams.get("tags"), "story");
  assert.equal(u.searchParams.get("query"), "model context protocol");
  assert.equal(u.searchParams.get("numericFilters"), `created_at_i>${NOW / 1000 - 7 * 86400},points>=10`);
  assert.equal(u.searchParams.get("hitsPerPage"), "1000");
});

async function withFetch(res: Response, fn: () => Promise<void>) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => res;
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("429·5xx·모양이 다른 응답은 수집 오류(빈 결과로 단정하지 않음)", async () => {
  const kindOf = (kind: string) => (e: unknown) => e instanceof CollectError && e.kind === kind;
  await withFetch(new Response("slow down", { status: 429 }), () => assert.rejects(fetchHnHits("mcp", NOW), kindOf("rate_limited")));
  await withFetch(new Response("oops", { status: 503 }), () => assert.rejects(fetchHnHits("mcp", NOW), kindOf("http_status")));
  await withFetch(new Response("{}", { status: 200 }), () => assert.rejects(fetchHnHits("mcp", NOW), kindOf("parse")));
  await withFetch(new Response(JSON.stringify({ hits: [{ objectID: "1", title: "a", points: "12" }] }), { status: 200 }), () => assert.rejects(fetchHnHits("mcp", NOW), kindOf("parse"))); // 모두 칸이 빠짐 = 모양이 바뀜
  await withFetch(new Response(JSON.stringify({ hits: [] }), { status: 200 }), async () => assert.deepEqual(await fetchHnHits("mcp", NOW), { hits: [], invalid: 0 }));
});
