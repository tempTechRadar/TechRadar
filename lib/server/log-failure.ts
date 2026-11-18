// 던질 오류가 따로 있거나 결과에 영향이 없어서 "삼키는" 자리에서도 이유는 로그에 남긴다(rules/code.md: 오류는 삼키지 않는다).
// 키·토큰 같은 값이 로그에 섞이지 않게 가린다. 상대 경로 import만 쓴다: `@/` 별칭이 있으면 node --test가 불러오지 못한다.
import { maskSecrets } from "../domain/redact.ts";

/** `.catch(logFailure("무엇을 못 했는지"))`: 원래 오류를 던지는 중에 뒷정리(실행 닫기·단계 기록)가 또 실패했을 때 쓴다. 던지지 않는다. */
export const logFailure = (what: string) => (e: unknown): void => {
  console.error(what, maskSecrets(String(e instanceof Error ? e.message : e)));
};

/** Supabase는 실패해도 던지지 않고 `{ error }`를 돌려준다. 그 값이 오류면 로그로 남기고, 없으면 아무것도 하지 않는다. */
export function logIfError(what: string, result: { error: { message: string } | null }): void {
  if (result.error) console.error(what, maskSecrets(result.error.message));
}
