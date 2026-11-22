// Claude를 부를지 정한다(SPEC-9 AI 사용 규칙). DB·Claude를 모르는 순수 함수.
// 한도 숫자는 팀 추정이다(SPEC-9): 강사가 준 키의 한도를 확인하면 여기만 고친다.
export type AiPurpose = "draft" | "scenario" | "chatbot" | "blueprint_check";

export type AiCallState = {
  /** 이 변경에 대응안 초안이 이미 있는지(초안은 변경마다 1번, 공용) */
  changeHasDraft: boolean;
  /** 오늘 이 사용자가 부른 횟수(적용 시나리오·위키 챗봇 한도) */
  userCallsToday: number;
  /** 오늘 서비스 전체가 부른 횟수 */
  serviceCallsToday: number;
};

export type AiDecision = { allow: true } | { allow: false; reason: "already_drafted" | "user_limit" | "service_limit" };

export const SCENARIO_PER_USER_PER_DAY = 5;
export const CHATBOT_PER_USER_PER_DAY = 20; // PRD-F31
export const BLUEPRINT_CHECK_PER_USER_PER_DAY = 3; // P-12e: 확정본에서 "점검 받기"를 누를 때만(같은 재료로 다시 누르면 이전 결과를 다시 써서 세지 않음)
export const SERVICE_PER_DAY = 200;

export function decideAiCall(purpose: AiPurpose, state: AiCallState): AiDecision {
  // 이미 있는 초안은 한도를 쓰지 않으니 가장 먼저 거른다
  if (purpose === "draft" && state.changeHasDraft) return { allow: false, reason: "already_drafted" };
  if (purpose === "scenario" && state.userCallsToday >= SCENARIO_PER_USER_PER_DAY) return { allow: false, reason: "user_limit" };
  if (purpose === "chatbot" && state.userCallsToday >= CHATBOT_PER_USER_PER_DAY) return { allow: false, reason: "user_limit" };
  if (purpose === "blueprint_check" && state.userCallsToday >= BLUEPRINT_CHECK_PER_USER_PER_DAY) return { allow: false, reason: "user_limit" };
  if (state.serviceCallsToday >= SERVICE_PER_DAY) return { allow: false, reason: "service_limit" };
  return { allow: true };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "오늘"의 시작: 한국 시간 0시를 UTC 시각(ISO)으로 */
export function startOfKoreanDay(now: Date): string {
  const koreanMs = now.getTime() + KST_OFFSET_MS;
  return new Date(Math.floor(koreanMs / DAY_MS) * DAY_MS - KST_OFFSET_MS).toISOString();
}
