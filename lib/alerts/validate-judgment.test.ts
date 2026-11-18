import { test } from "node:test";
import assert from "node:assert/strict";
import { validateJudgment } from "./validate-judgment.ts";

test("보류는 이유가 앞뒤 공백을 뺀 5자 이상일 때만 되고, 이유는 공백을 뺀 채 저장한다", () => {
  const input = { decision: "hold", alertKind: "security" as const, fixedVersion: null };

  const tooShort = validateJudgment({ ...input, reason: "  너무짧  " });
  const enough = validateJudgment({ ...input, reason: "  지금은 바꿀 시간이 없어요  " });

  assert.deepEqual(tooShort, { ok: false, message: "보류하는 이유를 5자 이상 적어 주세요." });
  assert.deepEqual(enough, { ok: true, value: { decision: "hold", reason: "지금은 바꿀 시간이 없어요", fixedVersion: null } });
});

test("판단 값이 적용 후보나 보류가 아니면 막는다", () => {
  const result = validateJudgment({ decision: "approve", reason: "", alertKind: "security", fixedVersion: "1.0.0" });

  assert.deepEqual(result, { ok: false, message: "적용 후보나 보류 중에서 골라 주세요." });
});

test("보안 경고의 적용 후보는 고친 버전과 함께만 저장한다(ADR 0012). 고친 버전이 없으면 막는다", () => {
  const input = { decision: "candidate", reason: "", alertKind: "security" as const };

  const withFix = validateJudgment({ ...input, fixedVersion: "0.1.16" });
  const withoutFix = validateJudgment({ ...input, fixedVersion: null });

  assert.deepEqual(withFix, { ok: true, value: { decision: "candidate", reason: null, fixedVersion: "0.1.16" } });
  assert.deepEqual(withoutFix, { ok: false, message: "고친 버전이 아직 없어서 적용 후보로 저장할 수 없어요. 보류로 남겨 주세요." });
});

test("적용 기회의 적용 후보는 고친 버전이 필요 없다", () => {
  const result = validateJudgment({ decision: "candidate", reason: "", alertKind: "opportunity", fixedVersion: null });

  assert.deepEqual(result, { ok: true, value: { decision: "candidate", reason: null, fixedVersion: null } });
});
