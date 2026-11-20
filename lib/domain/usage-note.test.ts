import assert from "node:assert/strict";
import test from "node:test";
import { NOTE_MAX, REPORT_REASON_MAX, noteLength, validateReportReason, validateUsageNote } from "./usage-note.ts";

const input = (over: Partial<{ usedFor: string; result: string; tip: string }> = {}) => ({ usedFor: "검색에 썼어요", result: "잘 됐어요", tip: "키는 환경변수로", ...over });

test("세 칸을 앞뒤 공백을 떼어 돌려준다", () => {
  const r = validateUsageNote(input({ usedFor: "  검색  ", result: "\n잘 됨\n", tip: " 팁 " }));
  assert.deepEqual(r, { ok: true, note: { usedFor: "검색", result: "잘 됨", tip: "팁" } });
});

test("빈 칸이나 공백만 있는 칸은 거절한다", () => {
  for (const bad of [input({ usedFor: "" }), input({ result: "   " }), input({ tip: "\n\t" })]) {
    const r = validateUsageNote(bad);
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, /세 칸/);
  }
});

test("세 칸을 합쳐 500자까지, 정확히 500자는 통과 (공백을 뗀 뒤 센다)", () => {
  assert.equal(NOTE_MAX, 500);
  assert.equal(validateUsageNote(input({ usedFor: "가".repeat(200), result: "나".repeat(200), tip: "다".repeat(100) })).ok, true);
  const over = validateUsageNote(input({ usedFor: "가".repeat(200), result: "나".repeat(200), tip: "다".repeat(101) }));
  assert.equal(over.ok, false);
  assert.match(over.ok ? "" : over.error, /500자.*501자/);
  assert.equal(validateUsageNote(input({ usedFor: "  " + "가".repeat(200) + "  ", result: "나".repeat(200), tip: "다".repeat(100) })).ok, true);
});

test("이모지 한 글자는 1자로 센다 (DB의 글자 수와 같게)", () => {
  assert.equal(noteLength({ usedFor: "😀😀", result: "a", tip: "b" }), 4);
  assert.equal(validateUsageNote(input({ usedFor: "😀".repeat(200), result: "나".repeat(200), tip: "다".repeat(100) })).ok, true);
});

test("신고 사유는 1~200자, 공백을 뗀다", () => {
  assert.equal(REPORT_REASON_MAX, 200);
  assert.deepEqual(validateReportReason("  광고예요 "), { ok: true, reason: "광고예요" });
  assert.equal(validateReportReason("   ").ok, false);
  assert.equal(validateReportReason("가".repeat(200)).ok, true);
  assert.equal(validateReportReason("가".repeat(201)).ok, false);
});
