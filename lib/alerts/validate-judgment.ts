// 판단 입력 검사(SPEC-4.1, ADR 0012). DB(save_judgment)도 같은 규칙을 한 번 더 막는다: 여기는 저장 전에 쉬운 말로 알리려는 것.
import type { AlertKind } from "./filter-alerts.ts";

export type JudgmentInput = { decision: string; reason: string; alertKind: AlertKind; fixedVersion: string | null };
export type ValidJudgment = { decision: "candidate" | "hold"; reason: string | null; fixedVersion: string | null };
export type JudgmentCheck = { ok: true; value: ValidJudgment } | { ok: false; message: string };

const MIN_HOLD_REASON = 5;
export const NO_FIXED_VERSION_MESSAGE = "고친 버전이 아직 없어서 적용 후보로 저장할 수 없어요. 보류로 남겨 주세요.";

export function validateJudgment(input: JudgmentInput): JudgmentCheck {
  if (input.decision === "hold") {
    const reason = input.reason.trim();
    if (reason.length < MIN_HOLD_REASON) return { ok: false, message: `보류하는 이유를 ${MIN_HOLD_REASON}자 이상 적어 주세요.` };
    return { ok: true, value: { decision: "hold", reason, fixedVersion: null } };
  }
  if (input.decision === "candidate") {
    if (input.alertKind !== "security") return { ok: true, value: { decision: "candidate", reason: null, fixedVersion: null } };
    if (!input.fixedVersion) return { ok: false, message: NO_FIXED_VERSION_MESSAGE };
    return { ok: true, value: { decision: "candidate", reason: null, fixedVersion: input.fixedVersion } };
  }
  return { ok: false, message: "적용 후보나 보류 중에서 골라 주세요." };
}
