// 로그인 직후 어디로 보낼까(PRD-F1, IA-1). 가입 직후(임시 별명)에는 별명을 정하는 설정 화면으로, 그 밖에는 가려던 곳으로.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이 있으면 node --test가 불러오지 못한다.
import { isTempNickname } from "../domain/nickname.ts";

/** `next`는 이미 safeNext를 거친 이 사이트 안의 경로. 별명을 읽지 못했으면(null) 로그인을 막지 않고 가려던 곳으로 */
export function afterLoginPath(next: string, nickname: string | null, userId: string): string {
  if (nickname === null || !isTempNickname(nickname, userId)) return next;
  return next === "/" ? "/settings?welcome=1" : `/settings?welcome=1&next=${encodeURIComponent(next)}`;
}
