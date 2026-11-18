import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAiCall, startOfKoreanDay, type AiCallState } from "./decide-ai-call.ts";

// SPEC-9: 대응안 초안은 변경마다 1번, 적용 시나리오는 사용자당 하루 5번, 서비스 전체 하루 200번.
const fresh: AiCallState = { changeHasDraft: false, userCallsToday: 0, serviceCallsToday: 0 };

test("대응안 초안은 변경마다 1번: 이미 초안이 있으면 부르지 않는다", () => {
  assert.deepEqual(decideAiCall("draft", fresh), { allow: true });
  assert.deepEqual(decideAiCall("draft", { ...fresh, changeHasDraft: true }), { allow: false, reason: "already_drafted" });
});

test("적용 시나리오는 사용자당 하루 5번까지(5번째는 되고 6번째부터 막힌다)", () => {
  assert.deepEqual(decideAiCall("scenario", { ...fresh, userCallsToday: 4 }), { allow: true });
  assert.deepEqual(decideAiCall("scenario", { ...fresh, userCallsToday: 5 }), { allow: false, reason: "user_limit" });
});

test("서비스 전체 하루 200번: 199번째까지 되고 200번을 채우면 막힌다(초안·시나리오 모두)", () => {
  assert.deepEqual(decideAiCall("draft", { ...fresh, serviceCallsToday: 199 }), { allow: true });
  assert.deepEqual(decideAiCall("draft", { ...fresh, serviceCallsToday: 200 }), { allow: false, reason: "service_limit" });
  assert.deepEqual(decideAiCall("scenario", { ...fresh, serviceCallsToday: 200 }), { allow: false, reason: "service_limit" });
});

test("이미 초안이 있는 것은 한도를 쓰지 않고 먼저 거른다(한도가 찼어도 이유는 already_drafted)", () => {
  assert.deepEqual(decideAiCall("draft", { changeHasDraft: true, userCallsToday: 0, serviceCallsToday: 200 }), { allow: false, reason: "already_drafted" });
});

test("'하루'는 한국 시간 0시부터다: 한국 날짜가 바뀌는 시각(UTC 15:00)을 경계로 한다", () => {
  assert.equal(startOfKoreanDay(new Date("2026-11-18T14:59:59Z")), "2026-11-17T15:00:00.000Z"); // 한국 11-18 23:59 → 11-18 0시
  assert.equal(startOfKoreanDay(new Date("2026-11-18T15:00:00Z")), "2026-11-18T15:00:00.000Z"); // 한국 11-19 0시 → 새 하루
});
