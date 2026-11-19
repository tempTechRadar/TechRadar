import assert from "node:assert/strict";
import test from "node:test";
import { isTempNickname, validateNickname } from "./nickname.ts";

// PRD-F1·F34, IA-1: 별명은 다른 사용자에게 "쓰고 있어요"로 보인다. 이메일·실명이 새지 않게 막고, 임시 별명 모양은 쓰지 못하게 한다.
const ok = (raw: string) => {
  const r = validateNickname(raw);
  assert.equal(r.ok, true, raw);
  return r.ok ? r.nickname : "";
};
const bad = (raw: string, pattern: RegExp) => {
  const r = validateNickname(raw);
  assert.equal(r.ok, false, raw);
  if (!r.ok) assert.match(r.error, pattern);
};

test("평범한 별명은 앞뒤 공백을 떼고 받는다", () => {
  assert.equal(ok("  레이더맨 "), "레이더맨");
  assert.equal(ok("sik"), "sik");
});

test("길이는 2~30자(글자 수, 이모지 하나도 한 글자)", () => {
  bad("a", /2~30자/);
  bad("", /2~30자/);
  bad("   ", /2~30자/);
  assert.equal(ok("가나"), "가나");
  assert.equal(ok("a".repeat(30)), "a".repeat(30));
  bad("a".repeat(31), /2~30자/);
  assert.equal(ok("😀😀"), "😀😀");
  assert.equal(ok("😀".repeat(30)), "😀".repeat(30));
  bad("😀".repeat(31), /2~30자/);
});

test("이메일처럼 @가 든 별명은 거절한다(구글 이메일이 보이지 않게)", () => {
  bad("me@example.com", /@/);
  bad("@handle", /@/);
});

test("임시 별명 모양(user- + 16진 8자)은 거절하지만 다른 user- 별명은 받는다", () => {
  bad("user-0123abcd", /임시 별명/);
  bad("USER-0123ABCD", /임시 별명/);
  assert.equal(ok("user-kim"), "user-kim");
  assert.equal(ok("user-0123abcde"), "user-0123abcde");
  assert.equal(ok("my-user-0123abcd"), "my-user-0123abcd"); // 임시 별명 모양 그 자체만 막는다
});

test("제어 문자(줄바꿈·탭·널)가 든 별명은 거절한다", () => {
  bad("kim\nlee", /제어 문자/);
  bad("kim\tlee", /제어 문자/);
  bad("kim\u0000lee", /제어 문자/);
  bad("kim\u007flee", /제어 문자/);
});

test("임시 별명인지: 내 id 앞 8자로 만든 것만", () => {
  const id = "5ed12543-734b-4447-9811-80e947a1401b";
  assert.equal(isTempNickname("user-5ed12543", id), true);
  assert.equal(isTempNickname("user-5ed12544", id), false);
  assert.equal(isTempNickname("레이더맨", id), false);
  assert.equal(isTempNickname("User-5ed12543", id), false);
});

test("보이지 않는 글자만으로 된 별명은 거절한다(화면에 빈 이름이 뜨지 않게)", () => {
  bad("\u3164\u3164", /보이는 글자/); // 한글 채움 문자
  bad("\u200b\u200b", /제어|보이는/); // 폭 0 공백
  bad("\u2800\u2800", /보이는 글자/); // 점자 빈칸
  bad("\u00a0\u00a0\u00a0", /2~30자|보이는 글자/); // 줄바꿈 없는 공백(다듬은 뒤 길이가 모자라거나 보이는 글자가 없음)
  bad("a\u3164", /보이는 글자|2~30자/);
});

test("방향을 뒤집는 글자·C1 제어 문자·서식 문자는 거절한다", () => {
  bad("ab\u202ecd", /제어/); // RTL 덮어쓰기
  bad("ab\u0085cd", /제어/); // C1 제어 문자
  bad("ab\u200bcd", /제어/); // 폭 0 공백이 가운데 낀 경우
  bad("ab\u2028cd", /제어/); // 줄 구분자
});

test("전각 ＠ 같은 @ 모양도 거절한다(NFKC로 본다)", () => {
  bad("me\uff20x.com", /@/);
  bad("me\ufe6bx.com", /@/);
});

test("한글 자모 분해형(NFD)은 완성형(NFC)으로 바꿔 받는다(겉보기가 같은 중복을 줄임)", () => {
  const nfd = "한글러".normalize("NFD");
  assert.notEqual(nfd, "한글러");
  assert.equal(ok(nfd), "한글러");
});

test("일반 공백이 가운데 있는 별명은 받는다", () => {
  assert.equal(ok("레이더 맨"), "레이더 맨");
});
