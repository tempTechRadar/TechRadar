import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRepoPublic, CollectError, RepoNotPublicError, fetchText } from "./collect-fetch.ts";

const repo = { owner: "o", repo: "r" };
const respond = (t: { mock: { method: (o: object, n: "fetch", f: unknown) => unknown } }, make: () => Response | Error) =>
  t.mock.method(globalThis, "fetch", async () => {
    const r = make();
    if (r instanceof Error) throw r;
    return r;
  });

test("공개 저장소(200, private 아님)면 통과한다", async (t) => {
  respond(t, () => new Response('{"private":false}', { status: 200 }));
  await assertRepoPublic(repo);
});

test("404는 '주소가 틀렸거나 비공개'다(RepoNotPublicError)", async (t) => {
  respond(t, () => new Response("{}", { status: 404 }));
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof RepoNotPublicError && e.kind === "http_status" && e.httpStatus === 404);
});

test("200이어도 private면 막는다", async (t) => {
  respond(t, () => new Response('{"private":true}', { status: 200 }));
  await assert.rejects(() => assertRepoPublic(repo), RepoNotPublicError);
});

test("한도 초과(429)는 '저장소 없음'이 아니다: 수집 오류 rate_limited(불변 2)", async (t) => {
  respond(t, () => new Response("", { status: 429 }));
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && !(e instanceof RepoNotPublicError) && e.kind === "rate_limited");
});

test("GitHub 한도 초과는 403(+x-ratelimit-remaining: 0)로도 온다: rate_limited. 헤더 없는 403은 http_status", async (t) => {
  const fetchMock = respond(t, () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } })) as { mock: { mockImplementation: (f: () => Promise<Response>) => void } };
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && e.kind === "rate_limited" && e.httpStatus === 403);
  fetchMock.mock.mockImplementation(async () => new Response("", { status: 403 }));
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && e.kind === "http_status");
});

test("연결 실패는 network, 500은 http_status, 깨진 응답은 parse — 어느 것도 '저장소 없음'이 아니다", async (t) => {
  const fetchMock = respond(t, () => new TypeError("fetch failed")) as { mock: { mockImplementation: (f: () => Promise<Response>) => void } };
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && !(e instanceof RepoNotPublicError) && e.kind === "network");
  fetchMock.mock.mockImplementation(async () => new Response("", { status: 500 }));
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 500);
  fetchMock.mock.mockImplementation(async () => new Response("<html>", { status: 200 }));
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && e.kind === "parse");
});

test("fetchText: 404는 null(파일 없음), 정상은 본문", async (t) => {
  const fetchMock = respond(t, () => new Response("", { status: 404 })) as { mock: { mockImplementation: (f: () => Promise<Response>) => void } };
  assert.equal(await fetchText("https://x.invalid/a"), null);
  fetchMock.mock.mockImplementation(async () => new Response("본문", { status: 200 }));
  assert.equal(await fetchText("https://x.invalid/a"), "본문");
});
