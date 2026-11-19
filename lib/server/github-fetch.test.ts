import { test } from "node:test";
import assert from "node:assert/strict";
import { CollectError } from "./collect-fetch.ts";
import { fetchRepoInfo } from "./github-fetch.ts";

type Call = { arguments: unknown[] };
type FetchMock = { mock: { calls: Call[]; mockImplementation: (f: () => Promise<Response>) => void } };
type Mockable = { mock: { method: (o: object, n: "fetch", f: unknown) => FetchMock } };
const respond = (t: Mockable, make: () => Response | Error) =>
  t.mock.method(globalThis, "fetch", async () => {
    const r = make();
    if (r instanceof Error) throw r;
    return r;
  });
const BODY = JSON.stringify({ full_name: "acme/tool", private: false, archived: false, pushed_at: "2026-11-01T00:00:00Z", stargazers_count: 7, license: { spdx_id: "MIT" } });
const TOKEN = "ghp_SECRETSECRETSECRET1234567890";
const REF = { owner: "acme", repo: "tool" };

test("fetchRepoInfo: 저장소 정보 주소를 토큰 머리글과 함께 부르고 읽은 값을 돌려준다. 토큰은 주소에 안 들어간다", async (t) => {
  const mock = respond(t, () => new Response(BODY));
  const info = await fetchRepoInfo(REF, TOKEN);
  assert.deepEqual(info, { fullName: "acme/tool", isPrivate: false, archived: false, pushedAt: "2026-11-01T00:00:00Z", stars: 7, license: "MIT" });
  const [url, init] = mock.mock.calls[0].arguments as [string, RequestInit];
  assert.equal(url, "https://api.github.com/repos/acme/tool");
  const h = init.headers as Record<string, string>;
  assert.deepEqual([h.authorization, h.accept, h["x-github-api-version"]], [`Bearer ${TOKEN}`, "application/vnd.github+json", "2022-11-28"]);
  assert.ok(!url.includes(TOKEN));
});

test("404는 null(찾을 수 없음)이다 — 수집 오류가 아니다. 사라짐 판정(2번 연속)은 부른 쪽 몫", async (t) => {
  respond(t, () => new Response("{}", { status: 404 }));
  assert.equal(await fetchRepoInfo(REF, TOKEN), null);
});

test("한도 초과는 429뿐 아니라 403 + x-ratelimit-remaining 0으로도 온다: 둘 다 rate_limited. 다른 403·500은 http_status", async (t) => {
  const mock = respond(t, () => new Response("", { status: 429 }));
  await assert.rejects(() => fetchRepoInfo(REF, TOKEN), (e) => e instanceof CollectError && e.kind === "rate_limited");
  mock.mock.mockImplementation(async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
  await assert.rejects(() => fetchRepoInfo(REF, TOKEN), (e) => e instanceof CollectError && e.kind === "rate_limited");
  mock.mock.mockImplementation(async () => new Response("", { status: 403 }));
  await assert.rejects(() => fetchRepoInfo(REF, TOKEN), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 403);
  mock.mock.mockImplementation(async () => new Response("", { status: 500 }));
  await assert.rejects(() => fetchRepoInfo(REF, TOKEN), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 500);
});

test("200이어도 모양이 다르면 parse 오류: 별 0·라이선스 없음으로 읽지 않는다", async (t) => {
  const mock = respond(t, () => new Response('{"message":"x"}'));
  await assert.rejects(() => fetchRepoInfo(REF, TOKEN), (e) => e instanceof CollectError && e.kind === "parse");
  mock.mock.mockImplementation(async () => new Response("<html>"));
  await assert.rejects(() => fetchRepoInfo(REF, TOKEN), (e) => e instanceof CollectError && e.kind === "parse");
});

test("연결 실패는 network로 던지고 오류 문구에 토큰이 없다", async (t) => {
  respond(t, () => new TypeError("fetch failed"));
  await assert.rejects(
    () => fetchRepoInfo(REF, TOKEN),
    (e) => e instanceof CollectError && e.kind === "network" && !e.message.includes(TOKEN) && !e.message.includes("ghp_"),
  );
});
