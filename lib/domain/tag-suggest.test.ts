import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestTags } from "./tag-suggest.ts";

const facts = { field: "배포·운영", sub: "CI", kind: "MCP", official: true };

test("자동 제안: 분야 → 갈래 → 하는 일(청사진 단계) → 종류 → 공식 순서", () => {
  assert.deepEqual(suggestTags(facts, []), ["배포·운영", "CI", "배포", "MCP", "공식"]);
});

test("자동 제안: 이미 붙은 것(대소문자 무시) · 분류 전 표시 · 공식 아님은 빼고, 같은 말은 한 번", () => {
  assert.deepEqual(suggestTags({ ...facts, official: false }, ["mcp", "CI"]), ["배포·운영", "배포"]);
  assert.deepEqual(suggestTags({ field: "아직 분류 안 됨", sub: "아직 분류 안 됨", kind: "직접 넣은 것", official: false }, []), []);
  // 분야 · 갈래 · 단계 이름이 겹치면 한 번(리서치), 하는 일은 앞의 두 단계(문제정의 · 리서치)
  assert.deepEqual(suggestTags({ field: "리서치", sub: "리서치", kind: "스킬", official: false }, []), ["리서치", "문제정의", "스킬"]);
});

test("자동 제안: 기술당 한도(10개)를 넘지 않는다", () => {
  const nine = Array.from({ length: 9 }, (_, i) => `t${i}`);
  assert.equal(suggestTags(facts, nine).length, 1);
  assert.deepEqual(suggestTags(facts, [...nine, "t9"]), []);
});
