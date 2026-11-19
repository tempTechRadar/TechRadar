// 분류 확인 화면 입력 검사(P-18b, IA-17, ADR 0015). DB에 가기 전에 사유와 새 규칙을 거른다. 순수 함수.
import { looksSecret } from "../install/validate-item.ts";

export type RuleKind = "allow_package" | "github_topic" | "hn_keyword" | "official_org";
export type NewRule = { kind: RuleKind; ecosystem: "npm" | "pypi" | null; value: string };
export type RuleInput = { kind: string; ecosystem: string; value: string };

// 위험 패턴(risk_pattern)은 코드 규칙(SPEC-2)과 짝이라 화면에서 새로 만들지 않는다(켜기·끄기만).
export const ADDABLE_KINDS: RuleKind[] = ["allow_package", "github_topic", "hn_keyword", "official_org"];
const ECOSYSTEMS = ["npm", "pypi"] as const;

/** 사유: 앞뒤 공백 제거, 5–300자, 비밀값처럼 보이면 거절(바꾼 기록에 영구히 남으므로). */
export function checkReason(raw: string): { ok: true; reason: string } | { ok: false } {
  const reason = (raw ?? "").trim();
  if (reason.length < 5 || reason.length > 300 || looksSecret(reason)) return { ok: false };
  return { ok: true, reason };
}

/** 새 규칙: 추가할 수 있는 종류만, 허용 패키지는 생태계 필수, 값은 공백 없는 1–100자. */
export function checkNewRule(input: RuleInput): { ok: true; rule: NewRule } | { ok: false } {
  const kind = ADDABLE_KINDS.find((k) => k === input.kind);
  if (!kind) return { ok: false };
  const value = (input.value ?? "").trim();
  if (!value || value.length > 100 || /\s/.test(value) || looksSecret(value)) return { ok: false };
  if (kind !== "allow_package") return { ok: true, rule: { kind, ecosystem: null, value } };
  const ecosystem = ECOSYSTEMS.find((e) => e === input.ecosystem);
  return ecosystem ? { ok: true, rule: { kind, ecosystem, value } } : { ok: false };
}
