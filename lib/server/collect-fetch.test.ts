import { test } from "node:test";
import assert from "node:assert/strict";
import { assertRepoPublic, CollectError, RepoNotPublicError, fetchText, queryOsv } from "./collect-fetch.ts";

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
  fetchMock.mock.mockImplementation(async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "57", "retry-after": "60" } }));
  await assert.rejects(() => assertRepoPublic(repo), (e) => e instanceof CollectError && e.kind === "rate_limited"); // 2차 한도: 남은 횟수가 있어도 retry-after가 오면 한도 초과
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

test("queryOsv: 404는 '알려진 취약점 없음'이 아니라 수집 오류 http_status다(OSV는 문제가 없어도 200으로 답한다, 불변 2)", async (t) => {
  respond(t, () => new Response("", { status: 404 }));
  await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15"), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 404);
});

test("queryOsv: 200 {}는 오류가 아니라 알려진 취약점 없음", async (t) => {
  respond(t, () => new Response("{}", { status: 200 }));
  assert.deepEqual(await queryOsv("mcp-remote", "npm", "0.1.15"), []);
});

test("queryOsv: 깨진 응답은 수집 오류 parse", async (t) => {
  respond(t, () => new Response("<html>점검 중</html>", { status: 200 }));
  await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15"), (e) => e instanceof CollectError && e.kind === "parse");
});

test("본문을 읽다 시간 초과·끊김이 나도 그 호출만 수집 오류다(timeout·network): 원시 오류가 새어 읽기 전체를 멈추지 않는다(불변 2)", async (t) => {
  const broken = (err: Error) => ({ status: 200, ok: true, headers: new Headers(), text: async () => { throw err; } });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => broken(new DOMException("timed out", "TimeoutError"))) as { mock: { mockImplementation: (f: unknown) => void } };
  await assert.rejects(() => fetchText("https://x.invalid/a"), (e) => e instanceof CollectError && e.kind === "timeout");
  fetchMock.mock.mockImplementation(async () => broken(new TypeError("terminated")));
  await assert.rejects(() => fetchText("https://x.invalid/a"), (e) => e instanceof CollectError && e.kind === "network");
});

test("queryOsv: 모양이 다른 200 응답([]·숫자·null·vulns가 배열이 아님)은 '없음'이 아니라 수집 오류 parse", async (t) => {
  let body = "";
  respond(t, () => new Response(body, { status: 200 }));
  for (body of ["[]", "123", "null", '{"vulns":"x"}']) {
    await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15"), (e) => e instanceof CollectError && e.kind === "parse", body);
  }
});

test("queryOsv: 취약점 항목 모양이 이상해도(null 항목·affected 안의 null) 코드 오류로 터지지 않고 수집 오류 parse다", async (t) => {
  let body = "";
  respond(t, () => new Response(body, { status: 200 }));
  for (body of ['{"vulns":[null]}', '{"vulns":[{"id":"x","affected":[null]}]}']) {
    await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15"), (e) => e instanceof CollectError && e.kind === "parse", body);
  }
});

test("queryOsv: {vulns: []}도 오류가 아니라 알려진 취약점 없음", async (t) => {
  respond(t, () => new Response('{"vulns":[]}', { status: 200 }));
  assert.deepEqual(await queryOsv("mcp-remote", "npm", "0.1.15"), []);
});
