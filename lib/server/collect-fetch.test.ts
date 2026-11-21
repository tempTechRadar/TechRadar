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

test("queryOsv: 기본 한도(50만 자)를 넘는 큰 OSV 응답도 읽는다 — 취약점 많은 옛 버전이 매번 수집 오류가 되지 않게(QA Fail, litellm 약 70만 자)", async (t) => {
  const body = (n: number) => JSON.stringify({ vulns: [{ id: "A", details: "x".repeat(n) }] });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(body(700_000), { status: 200 }));
  assert.deepEqual((await queryOsv("litellm", "PyPI", null)).map((v) => v.id), ["A"]);
  fetchMock.mock.mockImplementation(async () => new Response(body(8_000_001), { status: 200 }));
  await assert.rejects(queryOsv("litellm", "PyPI", null), (e) => e instanceof CollectError && e.kind === "parse" && e.message.includes("너무 큼"), "한도는 남아 있다: 넘으면 '없음'이 아니라 수집 오류");
});

// OSV는 결과가 많으면 첫 쪽만 주고 next_page_token을 붙인다. 그 쪽만 전부로 읽으면 취약점을 놓쳐 "변화 없음"이 된다(불변 2).
const osvPages = (t: { mock: { method: (o: object, n: "fetch", f: unknown) => unknown } }, pages: Record<string, string>) => {
  const bodies: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    const token = (JSON.parse(String(init.body)) as { page_token?: string }).page_token ?? "";
    return new Response(pages[token], { status: 200 });
  });
  return bodies;
};

test("queryOsv: next_page_token이 있으면 다음 쪽을 page_token으로 불러 모든 쪽의 취약점을 모은다", async (t) => {
  const bodies = osvPages(t, {
    "": '{"vulns":[{"id":"A"}],"next_page_token":"p2"}',
    p2: '{"vulns":[{"id":"B"}],"next_page_token":"p3"}',
    p3: '{"vulns":[{"id":"C"}]}',
  });
  assert.deepEqual((await queryOsv("mcp-remote", "npm", "0.1.15", 0)).map((v) => v.id), ["A", "B", "C"]);
  assert.equal(bodies.length, 3);
  assert.ok(!bodies[0].includes("page_token"), "첫 호출에는 page_token이 없다");
  assert.equal((JSON.parse(bodies[1]) as { page_token: string }).page_token, "p2");
  assert.equal((JSON.parse(bodies[1]) as { package: { name: string } }).package.name, "mcp-remote", "다음 쪽에도 같은 조회 조건");
});

test("queryOsv: 같은 다음 쪽 표시가 되풀이되면 바로 수집 오류 parse: 읽은 쪽만으로 '없음'이라 하지 않고 헛되이 더 부르지 않는다", async (t) => {
  const bodies = osvPages(t, { "": '{"next_page_token":"x"}', x: '{"next_page_token":"x"}' });
  await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15", 0), (e) => e instanceof CollectError && e.kind === "parse");
  assert.equal(bodies.length, 2, "첫 쪽 + 같은 표시가 돌아온 쪽까지만");
});

test("queryOsv: 표시가 매번 새로워도 끝이 없으면 10쪽에서 멈추고 수집 오류 parse, 빈 쪽(표시만 있는 쪽)도 한 쪽으로 센다", async (t) => {
  let n = 0;
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => (calls++, new Response(`{"next_page_token":"t${n++}"}`, { status: 200 })));
  await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15", 0), (e) => e instanceof CollectError && e.kind === "parse");
  assert.equal(calls, 10);
});

test("queryOsv: 쪽 사이에 간격을 둔다(SPEC-8, 요청 사이 1초 이상) — 첫 쪽 앞에는 두지 않는다", async (t) => {
  osvPages(t, { "": '{"vulns":[],"next_page_token":"p2"}', p2: '{"vulns":[]}' });
  const start = Date.now();
  await queryOsv("mcp-remote", "npm", "0.1.15", 60);
  const took = Date.now() - start;
  assert.ok(took >= 55 && took < 400, `쪽 사이 한 번만 쉰다(${took}ms)`);
});

test("queryOsv: 중간 쪽이 404여도 앞 쪽 결과로 끝내지 않고 수집 오류 http_status", async (t) => {
  let call = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(call++ === 0 ? '{"vulns":[{"id":"A"}],"next_page_token":"p2"}' : "", { status: call === 1 ? 200 : 404 }));
  await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15", 0), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 404);
});

test("queryOsv: 중간 쪽이 실패하면 앞 쪽 결과만 돌려주지 않고 그 오류를 던진다", async (t) => {
  let call = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(call++ === 0 ? '{"vulns":[{"id":"A"}],"next_page_token":"p2"}' : "", { status: 500 }));
  await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15", 0), (e) => e instanceof CollectError && e.kind === "http_status" && e.httpStatus === 500);
});

test("queryOsv: next_page_token이 빈 문자열이거나 문자열이 아니면 끝난 것으로 보지 않고 수집 오류 parse(모양이 다른 응답)", async (t) => {
  let body = "";
  let calls = 0;
  respond(t, () => (calls++, new Response(body, { status: 200 })));
  for (body of ['{"vulns":[],"next_page_token":5}', '{"vulns":[],"next_page_token":{}}']) {
    calls = 0;
    await assert.rejects(() => queryOsv("mcp-remote", "npm", "0.1.15"), (e) => e instanceof CollectError && e.kind === "parse", body);
    assert.equal(calls, 1, `${body}: 모양이 다르면 다음 쪽을 부르지 않고 바로 오류`);
  }
  body = '{"vulns":[],"next_page_token":""}';
  assert.deepEqual(await queryOsv("mcp-remote", "npm", "0.1.15"), [], "빈 문자열은 다음 쪽 없음");
});
