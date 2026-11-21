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
