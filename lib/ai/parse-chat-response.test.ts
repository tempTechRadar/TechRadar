import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChatResponse, MAX_ANSWER_CHARS } from "./parse-chat-response.ts";
import { NOT_IN_WIKI } from "./build-chat-prompt.ts";

const allowed = ["wiki/정기-실행.md", "wiki/권한-관리자.md"];

test("정상 답: 답과 넘긴 쪽 안의 출처", () => {
  const r = parseChatResponse('{"answer":"매일 06:00에 돌아요.","sources":["wiki/정기-실행.md"]}', allowed);
  assert.deepEqual(r, { ok: true, answer: "매일 06:00에 돌아요.", sources: ["wiki/정기-실행.md"] });
});

test("JSON 앞뒤 글·코드 울타리가 있어도 읽는다", () => {
  const r = parseChatResponse('```json\n{"answer":"네","sources":["wiki/권한-관리자.md"]}\n```', allowed);
  assert.equal(r.ok && r.answer, "네");
});

test("넘기지 않은 쪽을 출처로 대면 버린다", () => {
  const r = parseChatResponse('{"answer":"네","sources":["wiki/권한-관리자.md","https://evil.example"]}', allowed);
  assert.deepEqual(r.ok && r.sources, ["wiki/권한-관리자.md"]);
});

test("출처가 하나도 없으면 지어낸 것으로 보고 '위키에 없습니다'", () => {
  const r = parseChatResponse('{"answer":"아마 매주 백업해요","sources":[]}', allowed);
  assert.deepEqual(r, { ok: true, answer: NOT_IN_WIKI, sources: [] });
});

test("Claude가 '위키에 없습니다'라고 하면 출처 없이 그대로", () => {
  const r = parseChatResponse(`{"answer":"${NOT_IN_WIKI}","sources":["wiki/정기-실행.md"]}`, allowed);
  assert.deepEqual(r, { ok: true, answer: NOT_IN_WIKI, sources: [] });
});

test("답이 800자를 넘으면 800자 안으로 자른다(DB 검사와 같음)", () => {
  const long = "가".repeat(1200);
  const r = parseChatResponse(JSON.stringify({ answer: long, sources: ["wiki/정기-실행.md"] }), allowed);
  assert.equal(r.ok && r.answer.length <= MAX_ANSWER_CHARS, true);
  assert.equal(MAX_ANSWER_CHARS, 800);
});

test("JSON이 아니거나 답이 비면 실패", () => {
  assert.equal(parseChatResponse("그냥 글", allowed).ok, false);
  assert.equal(parseChatResponse('{"answer":"  ","sources":[]}', allowed).ok, false);
});
