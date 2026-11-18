import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectError } from "./collect-fetch.ts";
import { fetchWeeklyDownloads } from "./downloads-fetch.ts";

type FetchMock = { mock: { calls: { arguments: unknown[] }[]; mockImplementation: (f: () => Promise<Response>) => void } };
type Mockable = { mock: { method: (o: object, n: "fetch", f: unknown) => FetchMock } };
const respond = (t: Mockable, make: () => Response | Error) =>
  t.mock.method(globalThis, "fetch", async () => {
    const r = make();
    if (r instanceof Error) throw r;
    return r;
  });
const npm = { ecosystem: "npm", name: "@modelcontextprotocol/sdk" } as const;
const pypi = { ecosystem: "pypi", name: "anthropic" } as const;

test("npm: 응답의 downloads를 읽고 알맞은 주소를 부른다", async (t) => {
  const fetchMock = respond(t, () => new Response('{"downloads":90522817,"package":"@modelcontextprotocol/sdk"}'));
  assert.equal(await fetchWeeklyDownloads(npm), 90522817);
  assert.equal(fetchMock.mock.calls[0].arguments[0], "https://api.npmjs.org/downloads/point/last-week/@modelcontextprotocol/sdk");
});

test("pypi: data.last_week를 읽는다", async (t) => {
  respond(t, () => new Response('{"data":{"last_day":1,"last_month":3,"last_week":2},"package":"anthropic"}'));
  assert.equal(await fetchWeeklyDownloads(pypi), 2);
});

test("404는 다운로드 0이 아니라 수집 오류(http_status, 404) — 불변 2", async (t) => {
  respond(t, () => new Response('{"error":"package x not found"}', { status: 404 }));
  await assert.rejects(() => fetchWeeklyDownloads(npm), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 404);
});

test("200이어도 모양이 다르면 parse 오류: 0으로 읽지 않는다", async (t) => {
  const fetchMock = respond(t, () => new Response('{"error":"x"}'));
  await assert.rejects(() => fetchWeeklyDownloads(npm), (e) => e instanceof CollectError && e.kind === "parse");
  fetchMock.mock.mockImplementation(async () => new Response('{"data":{}}'));
  await assert.rejects(() => fetchWeeklyDownloads(pypi), (e) => e instanceof CollectError && e.kind === "parse");
});

test("한도 초과(429)와 연결 실패는 종류를 지켜 던진다", async (t) => {
  const fetchMock = respond(t, () => new Response("", { status: 429 }));
  await assert.rejects(() => fetchWeeklyDownloads(pypi), (e) => e instanceof CollectError && e.kind === "rate_limited");
  fetchMock.mock.mockImplementation(async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(() => fetchWeeklyDownloads(npm), (e) => e instanceof CollectError && e.kind === "network");
});
