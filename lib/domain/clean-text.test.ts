import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanText } from "./clean-text.ts";

test("NUL·제어문자·제로폭·양방향 제어문자를 지우고 공백을 한 칸으로", () => {
  const dirty = "a\u0000b\u0007c\u0085d\u200be\u200ff\u2060g\ufeffh\u202ei\u2066j\u2069k \n\t l";
  const out = cleanText(dirty, 100);
  assert.equal(out, "a b c d e f g h i j k l");
  assert.ok(!/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/.test(out));
});

test("코드 포인트로 자르고 대리쌍을 반으로 자르지 않는다. ellipsis면 끝에 …", () => {
  assert.equal(cleanText(`${"x".repeat(9)}😀😀`, 10), `${"x".repeat(9)}😀`);
  assert.equal(cleanText(`${"x".repeat(9)}😀😀`, 10, true), `${"x".repeat(9)}…`);
  assert.equal(cleanText("짧은 글", 10, true), "짧은 글");
  assert.ok(cleanText("😀".repeat(50), 7).isWellFormed());
});

test("ZWJ·ZWNJ는 남긴다: 이모지 시퀀스와 페르시아어 같은 글이 깨지지 않게", () => {
  assert.equal(cleanText("개발자 \u{1f469}\u200d\u{1f4bb}", 20), "개발자 \u{1f469}\u200d\u{1f4bb}");
  assert.equal(cleanText("می\u200cخواهم", 20), "می\u200cخواهم");
});

test("아랍 글자 표시(U+061C)와 태그 문자(U+E0000–E007F)를 지운다", () => {
  assert.equal(cleanText("a\u061cb\u{e0001}c\u{e007f}d", 20), "a b c d");
});

test("소프트 하이픈·U+180E·주석 표시(U+FFF9–FFFB)·변이 선택자 보충(U+E0100–E01EF)을 지우고, 이모지 변이 선택자 U+FE0F는 남긴다", () => {
  assert.equal(cleanText("x\u00ad\u180e\ufff9\ufffb\u{e0100}\u{e01ef}y", 20), "x y");
  assert.equal(cleanText("\u2764\ufe0f 좋아요", 20), "\u2764\ufe0f 좋아요");
});

test("자른 끝에 매달린 ZWJ는 뗀다(이모지 시퀀스를 자를 때)", () => {
  assert.equal(cleanText("ab\u{1f469}\u200d\u{1f4bb}", 4), "ab\u{1f469}");
  assert.equal(cleanText("ab\u{1f469}\u200d\u{1f4bb}x", 5, true), "ab\u{1f469}…");
  assert.equal(cleanText("ab\u{1f469}\u200d\u{1f4bb}", 5), "ab\u{1f469}\u200d\u{1f4bb}", "자르지 않으면 그대로");
});

test("짝 없는 대리 문자는 U+FFFD로 바꾼다(Postgres가 거부하지 않게)", () => {
  const out = cleanText("\ud800abc", 20);
  assert.ok(out.isWellFormed());
  assert.equal(out, "�abc");
});
