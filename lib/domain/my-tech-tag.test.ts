import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_TAG_LEN, normalizeTag, tagKey } from "./my-tech-tag.ts";

test("태그 정리: 앞뒤 공백을 떼고 안의 연속 공백은 하나로, 대소문자는 그대로 둔다", () => {
  assert.deepEqual(normalizeTag("  사이드   프로젝트  "), { ok: true, tag: "사이드 프로젝트" });
  assert.deepEqual(normalizeTag("React"), { ok: true, tag: "React" });
  assert.equal(tagKey("React"), tagKey("react"));
});

test("빈 글자·30자 초과·글자가 아닌 값은 거절한다. 30자는 글자 수(한글·이모지 한 글자 = 1)로 센다", () => {
  assert.equal(normalizeTag("   ").ok, false);
  assert.equal(normalizeTag(42).ok, false);
  assert.equal(normalizeTag("가".repeat(MAX_TAG_LEN)).ok, true);
  assert.equal(normalizeTag("가".repeat(MAX_TAG_LEN + 1)).ok, false);
  assert.equal(normalizeTag("🙂".repeat(MAX_TAG_LEN)).ok, true);
});

test("안에 든 줄바꿈·탭·제어 문자는 거절한다(여러 줄이 한 태그로 뭉개지지 않게). 끝의 줄바꿈은 공백처럼 뗀다", () => {
  assert.equal(normalizeTag("a\nb").ok, false);
  assert.equal(normalizeTag("a\tb").ok, false);
  assert.equal(normalizeTag("a\u0000b").ok, false);
  assert.deepEqual(normalizeTag("a b\n"), { ok: true, tag: "a b" });
});

test("비밀값 모양은 태그로 받지 않는다", () => {
  const r = normalizeTag("sk-ant-api03-abcdefghijklmnop");
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /비밀값/);
});

test("C1 제어 문자(예: 다음 줄 NEL)도 DB check와 같게 거절한다(저장 실패를 '다시 시도'로 되풀이하지 않게)", () => {
  assert.equal(normalizeTag(`a${String.fromCharCode(0x85)}b`).ok, false);
  assert.equal(normalizeTag(`a${String.fromCharCode(0x9f)}b`).ok, false);
  assert.equal(normalizeTag(`a${String.fromCharCode(0xa0)}b`).ok, true, "줄바꿈 아닌 빈칸(NBSP)은 글자");
});
