import assert from "node:assert/strict";
import test from "node:test";
import { DRAFT_MISSING_TEXT } from "./draft-missing-text.ts";

// 대응안 초안이 비어 있을 때 카드가 하는 말. 비어 있는 이유가 Claude 실패일 수도, 같은 입력을 오늘 이미 보낸 것(하루 한 번 규칙)일 수도 있고
// 카드는 둘을 구분하지 못한다(이유를 저장하지 않음). 그래서 한쪽으로 단정하지 않고 둘 다 말한다.

test("실패라고 단정하지 않는다 (\"만들지 못했어요\"로 시작하지 않는다)", () => {
  assert.doesNotMatch(DRAFT_MISSING_TEXT, /^대응안 초안을 만들지 못했어요/);
  assert.match(DRAFT_MISSING_TEXT, /아직 없어요/);
});

test("가능한 이유 둘을 모두 말한다: 호출이 안 됐을 때, 오늘 이미 한 번 만들어 본 것을 건너뛴 때", () => {
  assert.match(DRAFT_MISSING_TEXT, /호출이 안 됐/);
  assert.match(DRAFT_MISSING_TEXT, /오늘 이미 한 번/);
  assert.match(DRAFT_MISSING_TEXT, /하루 한 번/);
});

test("사용자가 할 일을 말한다: 위 근거를 보고 직접 판단 (알림은 그대로 판단할 수 있다)", () => {
  assert.match(DRAFT_MISSING_TEXT, /위 근거를 보고 직접 판단해 주세요/);
});

test("한 문단으로 읽힌다: 줄바꿈이 없고 200자를 넘지 않는다", () => {
  assert.doesNotMatch(DRAFT_MISSING_TEXT, /\n/);
  assert.ok(Array.from(DRAFT_MISSING_TEXT).length <= 200, `${Array.from(DRAFT_MISSING_TEXT).length}자`);
});
