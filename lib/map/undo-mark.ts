import type { MarkStatus } from "./build-map";

/** 판단 표시 되돌리기는 전 상태로 한 번 더 저장한다. 적용 후보 · 보류로 다시 저장하면 DB 함수가 그 기술의 판단 대기 알림까지 함께 판단해 버리므로
 *  (덧붙이기만이라 되돌릴 수 없음, 사람이 고르지 않은 판단 = 불변 1) 관심 · 표시 없음으로 돌아갈 때만 되돌리기를 준다 */
export const canUndoMark = (prev: MarkStatus | null): boolean => prev === null || prev === "interest";
