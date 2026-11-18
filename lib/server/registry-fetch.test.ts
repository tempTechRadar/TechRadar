import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectError } from "./collect-fetch.ts";
import { fetchRegistryPage, registryUrl } from "./registry-fetch.ts";

type FetchMock = { mock: { calls: { arguments: unknown[] }[]; mockImplementation: (f: () => Promise<Response>) => void } };
type Mockable = { mock: { method: (o: object, n: "fetch", f: unknown) => FetchMock } };
const respond = (t: Mockable, make: () => Response | Error) =>
  t.mock.method(globalThis, "fetch", async () => {
    const r = make();
    if (r instanceof Error) throw r;
    return r;
  });
const ONE = JSON.stringify({ servers: [{ server: { name: "a/b" }, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true } } }], metadata: { nextCursor: "a/b:1.0.0", count: 1 } });

test("registryUrl: 한 쪽 100건·서버마다 최신 버전만(version=latest), 바뀐 것만 읽을 때는 updated_since, 이어 읽을 때는 cursor(특수문자는 인코딩)", () => {
  assert.equal(registryUrl({ since: null, cursor: null }), "https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest");
  assert.equal(registryUrl({ since: "2026-11-17T00:00:00.000Z", cursor: null }), "https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest&updated_since=2026-11-17T00%3A00%3A00.000Z");
  assert.equal(registryUrl({ since: null, cursor: "io.x/y:1.0.0" }), "https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest&cursor=io.x%2Fy%3A1.0.0");
});

test("fetchRegistryPage: 응답을 읽어 항목과 다음 쪽 커서를 돌려주고 알맞은 주소를 부른다", async (t) => {
  const fetchMock = respond(t, () => new Response(ONE));
  const page = await fetchRegistryPage({ since: null, cursor: "c0" });
  assert.deepEqual([page.entries.length, page.nextCursor], [1, "a/b:1.0.0"]);
  assert.equal(fetchMock.mock.calls[0].arguments[0], "https://registry.modelcontextprotocol.io/v0.1/servers?limit=100&version=latest&cursor=c0");
});

test("404는 서버가 없다는 뜻이 아니라 수집 오류(http_status, 404) — 불변 2", async (t) => {
  respond(t, () => new Response("{}", { status: 404 }));
  await assert.rejects(() => fetchRegistryPage({ since: null, cursor: null }), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 404);
});

test("200이어도 모양이 다르면 parse 오류: 0건으로 읽지 않는다", async (t) => {
  const fetchMock = respond(t, () => new Response('{"error":"x"}'));
  await assert.rejects(() => fetchRegistryPage({ since: null, cursor: null }), (e) => e instanceof CollectError && e.kind === "parse");
  fetchMock.mock.mockImplementation(async () => new Response("<html>"));
  await assert.rejects(() => fetchRegistryPage({ since: null, cursor: null }), (e) => e instanceof CollectError && e.kind === "parse");
});

test("한도 초과(429)와 연결 실패는 종류를 지켜 던진다", async (t) => {
  const fetchMock = respond(t, () => new Response("", { status: 429 }));
  await assert.rejects(() => fetchRegistryPage({ since: null, cursor: null }), (e) => e instanceof CollectError && e.kind === "rate_limited");
  fetchMock.mock.mockImplementation(async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(() => fetchRegistryPage({ since: null, cursor: null }), (e) => e instanceof CollectError && e.kind === "network");
});
