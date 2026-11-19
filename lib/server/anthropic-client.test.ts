import { test } from "node:test";
import assert from "node:assert/strict";
import { createAnthropicClient } from "./anthropic-client.ts";

const KEY = "TESTKEY_not_a_real_key_0123456789"; // 가짜 값(모양만 맞다)
const PROMPT = { system: "시스템 글", user: "사용자 글" };

type Call = { url: string; init: RequestInit };
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return respond();
  }) as typeof fetch;
  return { impl, calls };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answer = { content: [{ type: "text", text: "안녕" }], usage: { input_tokens: 11, output_tokens: 7 } };
const bodyOf = (c: Call) => JSON.parse(String(c.init.body)) as Record<string, unknown>;
const headersOf = (c: Call) => c.init.headers as Record<string, string>;

test("키가 없거나 비었거나 모양이 이상하면 null — 부르지 않고 '만들지 못함'으로 남긴다", () => {
  for (const key of [undefined, "", "   ", "짧음", "has space in the middle 0123456789", "line\nbreak_0123456789012345", `"${KEY}"`]) {
    assert.equal(createAnthropicClient({ ANTHROPIC_API_KEY: key }), null, String(key));
  }
});

test("요청 모양: POST Messages API, 키는 머리글에만, 도구 없이 글만 주고받는다(SPEC-9). 앞뒤 공백·줄바꿈은 다듬는다", async () => {
  const f = fakeFetch(() => json(answer));
  const client = createAnthropicClient({ ANTHROPIC_API_KEY: `  ${KEY}\n` }, f.impl)!;
  await client.complete(PROMPT);
  const [call] = f.calls;
  assert.equal(call.url, "https://api.anthropic.com/v1/messages");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(headersOf(call), { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" });
  const body = bodyOf(call);
  assert.deepEqual([body.model, body.max_tokens, body.system], ["claude-sonnet-5-5", 2048, "시스템 글"]);
  assert.deepEqual(body.messages, [{ role: "user", content: "사용자 글" }]);
  assert.equal("tools" in body || "tool_choice" in body, false);
  assert.ok(call.init.signal instanceof AbortSignal); // 멈춘 호출이 알림 만들기를 붙잡지 않게
  assert.equal(call.init.cache, "no-store"); // 다른 수집·호출 어댑터와 같게
  assert.equal(JSON.stringify(call).includes("ANTHROPIC_API_KEY"), false);
  assert.equal(String(call.init.body).includes(KEY), false); // 키는 본문에 안 들어간다
});

test("모델은 ANTHROPIC_MODEL로 바꾼다. 모양이 이상하면 기본값", async () => {
  const f = fakeFetch(() => json(answer));
  await createAnthropicClient({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "claude-haiku-5-5" }, f.impl)!.complete(PROMPT);
  await createAnthropicClient({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "bad model\nname" }, f.impl)!.complete(PROMPT);
  assert.deepEqual(f.calls.map((c) => bodyOf(c).model), ["claude-haiku-5-5", "claude-sonnet-5-5"]);
});

test("답: 글 블록만 이어 붙이고(그 밖 블록은 무시) 사용한 토큰 수를 돌려준다", async () => {
  const f = fakeFetch(() => json({ content: [{ type: "thinking", thinking: "속마음", text: "글이 아닌 블록의 글은 섞이면 안 됨" }, { type: "text", text: "앞" }, { type: "tool_use", id: "x" }, { type: "text", text: "뒤" }], usage: { input_tokens: 5, output_tokens: 9 } }));
  assert.deepEqual(await createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT), { text: "앞뒤", tokensIn: 5, tokensOut: 9 });
  const g = fakeFetch(() => json({ content: [{ type: "text", text: "글" }] })); // 사용량이 없으면 토큰은 비움
  assert.deepEqual(await createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, g.impl)!.complete(PROMPT), { text: "글", tokensIn: undefined, tokensOut: undefined });
});

test("글 답이 하나도 없으면 던진다 — 빈 초안을 성공으로 넘기지 않는다", async () => {
  for (const body of [{ content: [] }, { content: [{ type: "tool_use" }] }, { content: [{ type: "text", text: "   " }] }, {}]) {
    const f = fakeFetch(() => json(body));
    await assert.rejects(() => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT), /글 답이 없어요/, JSON.stringify(body));
  }
});

test("오류 응답은 상태 코드와 종류·설명을 담아 던진다. 응답이 키를 되풀이해도 오류 문구에는 키가 없다", async () => {
  for (const status of [401, 429, 500, 529]) {
    const f = fakeFetch(() => json({ type: "error", error: { type: "some_error", message: `문제 key=${KEY} 입니다` } }, status));
    await assert.rejects(
      () => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT),
      (e: Error) => e.message.includes(String(status)) && e.message.includes("some_error") && !e.message.includes(KEY),
      String(status),
    );
  }
  const html = fakeFetch(() => new Response("<html>게이트웨이 오류</html>", { status: 502 })); // JSON이 아닌 오류 본문
  await assert.rejects(() => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, html.impl)!.complete(PROMPT), /502/);
});

test("성공(200)인데 JSON이 아니거나 모양이 다른 답은 던진다", async () => {
  const html = fakeFetch(() => new Response("<html>점검 중</html>", { status: 200 }));
  await assert.rejects(() => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, html.impl)!.complete(PROMPT), /해석하지 못/);
  const array = fakeFetch(() => json([1, 2]));
  await assert.rejects(() => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, array.impl)!.complete(PROMPT), /글 답이 없어요|해석하지 못/);
});

test("본문을 읽는 도중 끊기거나 시간이 초과돼도 '빈 설명'이나 'JSON이 아님'으로 숨기지 않고 부르지 못한 것으로 던진다", async () => {
  for (const status of [200, 500]) {
    const broken = { ok: status === 200, status, text: () => Promise.reject(new Error(`본문 중단 ${KEY}`)) } as unknown as Response;
    const f = fakeFetch(() => broken);
    await assert.rejects(
      () => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT),
      (e: Error) => /Claude를 부르지 못했어요/.test(e.message) && e.message.includes("본문 중단") && !e.message.includes(KEY),
      String(status),
    );
  }
});

test("길이 한도(max_tokens)에서 잘린 답은 정상 답으로 돌려주지 않고 잘렸다고 던진다(원인이 '답이 JSON이 아니에요'에 묻히지 않게)", async () => {
  const f = fakeFetch(() => json({ content: [{ type: "text", text: '{"draft":"긴 초안이 잘리' }], stop_reason: "max_tokens", usage: { input_tokens: 300, output_tokens: 2048 } }));
  await assert.rejects(() => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT), /길이 한도에서 잘렸어요.*2048/);
  const done = fakeFetch(() => json({ content: [{ type: "text", text: "끝까지" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 2 } }));
  assert.equal((await createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, done.impl)!.complete(PROMPT)).text, "끝까지");
});

test("오류 설명은 키를 가린 뒤에 자른다 — 키가 자르는 자리에 걸쳐도 일부가 남지 않는다", async () => {
  const f = fakeFetch(() => json({ error: { type: "e", message: "가".repeat(185) + KEY } }, 500));
  await assert.rejects(
    () => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT),
    (e: Error) => !e.message.includes(KEY.slice(0, 8)),
  );
});

test("키가 있는데 모양이 이상하거나 모델 이름이 이상하면 로그에 한 줄 남긴다(값은 안 씀). 키가 아예 없으면 어댑터는 조용하다", () => {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
  try {
    createAnthropicClient({ ANTHROPIC_API_KEY: `"${KEY}"` });
    createAnthropicClient({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_MODEL: "bad model\nname" });
    createAnthropicClient({});
  } finally {
    console.warn = original;
  }
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /ANTHROPIC_API_KEY.*모양/);
  assert.match(warnings[1], /ANTHROPIC_MODEL/);
  assert.equal(warnings.some((w) => w.includes(KEY) || w.includes("bad model")), false);
});

test("연결이 끊기거나 시간이 초과되면 던진다. 오류가 키를 담고 있어도 문구에서 가린다", async () => {
  const f = fakeFetch(() => Promise.reject(new Error(`연결 실패 (헤더 ${KEY})`)));
  await assert.rejects(
    () => createAnthropicClient({ ANTHROPIC_API_KEY: KEY }, f.impl)!.complete(PROMPT),
    (e: Error) => /Claude를 부르지 못했어요/.test(e.message) && e.message.includes("연결 실패") && !e.message.includes(KEY),
  );
});
