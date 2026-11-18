// 중복 막기 키(SPEC-3.1·3.2, 불변 3). DB의 UK(changes.dedupe_key, alerts(user_id, dedupe_key))와 짝을 이룬다.
// 키 모양을 바꾸면 이미 저장된 줄과 어긋나 같은 변경이 두 번 생긴다. 바꾸지 말고 새 접두어를 쓴다.

import type { TechRef } from "./tech-key.ts";

const v = (version: string | null) => version ?? "-";

/** 공용 변경 키: 기술 키 + 버전 + 원인 + 위험이 된 회차. 다시 위험해지면 회차가 올라 새 변경이 된다. */
export function changeKey(tech: TechRef, causeId: string, dangerRound = 1): string {
  return `change:${tech.key}@${v(tech.version)}:${causeId}:r${dangerRound}`;
}

/** 변경에서 생긴 알림 키(사람은 alerts.user_id가 맡는다). */
export function alertKeyForChange(changeId: string): string {
  return `alert:${changeId}`;
}

/** 처음 확인한 위험: 사람 + 기술 키 + 버전 + 원인. 두 번째 사용자도 받고, 같은 사람이 다시 읽어도 한 번. */
export function firstSeenAlertKey(tech: TechRef, causeId: string): string {
  return `first:${tech.key}@${v(tech.version)}:${causeId}`;
}

/** 적용 기회: 내 기술 키 + 새 기술 키. */
export function opportunityKey(mine: TechRef, candidate: TechRef): string {
  return `opp:${mine.key}->${candidate.key}`;
}
