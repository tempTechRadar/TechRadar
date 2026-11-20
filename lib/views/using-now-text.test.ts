import assert from "node:assert/strict";
import test from "node:test";
import { usingNowText } from "./using-now-text.ts";

// PRD-F34·불변 2: 못 읽었을 때 "아무도 안 쓴다"로 보이지 않게 한다. 보이는 것은 공개한 사람의 별명과 수뿐.
test("공개한 사람이 있으면 수와 별명을 보여 준다", () => {
  assert.equal(usingNowText({ count: 2, nicknames: ["가나", "다라"] }), "2명이 쓰고 있어요: 가나, 다라");
  assert.equal(usingNowText({ count: 1, nicknames: ["혼자"] }), "1명이 쓰고 있어요: 혼자");
});

test("별명 목록이 수보다 짧으면(20개 한도) 나머지를 '외 n명'으로", () => {
  const names = Array.from({ length: 20 }, (_, i) => `별명${i}`);
  const text = usingNowText({ count: 25, nicknames: names });
  assert.match(text, /^25명이 쓰고 있어요: 별명0, 별명1/);
  assert.match(text, /외 5명$/);
});

test("아무도 공개하지 않았으면 그렇게 알린다(숨긴 사람은 세지 않는다는 것도)", () => {
  assert.equal(usingNowText({ count: 0, nicknames: [] }), "아직 쓴다고 공개한 사람이 없어요");
});

test("못 읽었으면(null) '없다'가 아니라 못 불러왔다고 알린다", () => {
  const text = usingNowText(null);
  assert.match(text, /불러오지 못했어요/);
  assert.doesNotMatch(text, /없어요/);
  assert.match(text, /쓰는 사람이 없다는 뜻이 아니에요/); // "아무도 안 쓴다"로 오해하지 않게 하는 안내
});

test("수가 별명보다 적게 오면(이상한 값) '외'를 만들지 않는다", () => {
  assert.equal(usingNowText({ count: 1, nicknames: ["가나", "다라"] }), "1명이 쓰고 있어요: 가나, 다라");
});
