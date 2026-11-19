// 로그인 뒤 돌아갈 주소(PRD-F1). 다른 사이트로 튕겨 보내는 데 쓰이지 않게 이 사이트 안의 경로만 받는다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이 있으면 node --test가 불러오지 못한다.

/** `/alerts`처럼 이 사이트 안의 경로만 그대로 돌려주고, 나머지(바깥 주소·`//`·`/\`·제어 문자·빈 값)는 첫 화면 `/`. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f\\]/.test(raw)) return "/";
  return raw;
}
