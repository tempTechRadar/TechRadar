import { test } from "node:test";
import assert from "node:assert/strict";
import { compactKo, describeKo } from "./describe.ts";

const node = (attrs: Record<string, string>, extra: Record<string, unknown> = {}) =>
  ({ attrs: { field: "아직 분류 안 됨", sub: "아직 분류 안 됨", kind: "MCP", ...attrs }, stars: null, weeklyDownloads: null, grade: "unknown", ...extra }) as Parameters<typeof describeKo>[0];

test("한국어 설명: 세부 갈래 → 하는 일 → 분류 전 순으로, 인기 · 보안을 덧붙임", () => {
  assert.deepEqual(describeKo(node({ field: "업무·서비스 연동", sub: "결제·금융" }, { stars: 1234, grade: "pass" })), ["결제·금융 쪽 MCP 서버", "별 1.2천 · 보안 통과"]);
  assert.deepEqual(describeKo(node({ field: "디자인", kind: "스킬" }, { weeklyDownloads: 34000 })), ["디자인 쪽 스킬", "주간 다운로드 3.4만"]);
  assert.deepEqual(describeKo(node({})), ["아직 분류 안 된 MCP 서버", ""]);
  assert.equal(compactKo(999), "999");
  assert.equal(compactKo(1000), "1천");
  assert.equal(compactKo(250000), "25만");
  assert.equal(compactKo(9960), "1만"); // 반올림 뒤 단위
  assert.equal(compactKo(300_000_000), "3억");
  assert.deepEqual(describeKo(node({ kind: "직접 넣은 것" })), ["아직 분류 안 된 기술", ""]); // 직접 넣은 기술
});
