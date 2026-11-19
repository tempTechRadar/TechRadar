import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCompareSelection } from "./parse-compare-selection.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const D = "44444444-4444-4444-8444-444444444444";
const MESSAGE = "2개에서 3개까지 골라 주세요.";

test("주소의 techs 값(쉼표로 잇거나 여러 번 반복)에서 2–3개의 고유한 기술 id를 읽는다", () => {
  assert.deepEqual(parseCompareSelection(`${A},${B}`), { state: "ok", ids: [A, B] });
  assert.deepEqual(parseCompareSelection([A, B, C]), { state: "ok", ids: [A, B, C] });
  assert.deepEqual(parseCompareSelection(` ${A} , ${B} , ${A}`), { state: "ok", ids: [A, B] }); // 공백·중복은 정리
});

test("아직 고르지 않았으면 빈 상태(안내 없이 고르기만), 1개이거나 4개 이상이면 안내 문구", () => {
  assert.deepEqual(parseCompareSelection(undefined), { state: "empty" });
  assert.deepEqual(parseCompareSelection(""), { state: "empty" });
  assert.deepEqual(parseCompareSelection(A), { state: "invalid", message: MESSAGE });
  assert.deepEqual(parseCompareSelection(`${A},${B},${C},${D}`), { state: "invalid", message: MESSAGE });
});

test("id 모양이 아닌 값은 버린다(DB 오류 방지): 걸러 낸 뒤 개수로 판단한다", () => {
  assert.deepEqual(parseCompareSelection(`${A},아무거나,${B}`), { state: "ok", ids: [A, B] });
  assert.deepEqual(parseCompareSelection(`${A},'; drop table`), { state: "invalid", message: MESSAGE });
});
