// 실행 기록(run_steps)·오류 메시지를 저장하기 전에 비밀값처럼 보이는 글자를 ***로 바꾼다(SPEC-8).
// 공개 저장소의 .mcp.json에 실수로 들어간 키가 기록에 남지 않게 한다. 지나치게 가리는 쪽이 안전하다.
const MASK = "***";
const MAX_LEN = 2000;

// 이름 끝이 KEY·TOKEN·SECRET·PASSWORD인 대문자 변수: SUPABASE_SERVICE_ROLE_KEY=값, TOKEN: 값
const NAMED = /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/g;
// 주소 뒤에 붙은 ?token=…&api_key=…
const QUERY = /([?&][\w-]*(?:key|token|secret|password)[\w-]*=)[^&\s#]+/gi;
// 모양만 봐도 키인 것
const SHAPES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g, // Anthropic·OpenAI류
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, // GitHub 토큰
  /\bsb_secret_[A-Za-z0-9_-]{8,}/g, // Supabase 비밀 키
  /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, // JWT(서비스 키 포함)
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
];

export function maskSecrets(text: string): string {
  let out = text.replace(NAMED, `$1${MASK}`).replace(QUERY, `$1${MASK}`);
  for (const shape of SHAPES) out = out.replace(shape, (m) => (m.startsWith("Bearer") ? `Bearer ${MASK}` : MASK));
  return out;
}

/**
 * 저장용: 비어 있으면 null, 가린 뒤 너무 길면 자른다.
 * 가리기(NAMED)는 긴 대문자 덩어리에서 글자 수의 제곱으로 느려지고 글은 믿을 수 없는 저장소에서 온다(.mcp.json 별명·requirements.txt 경로).
 * 그래서 가리기 전에 먼저 한 번 자른다. 가려서 줄어들 여유로 저장 길이의 2배를 남긴다.
 */
export function cleanForLog(text: string | undefined): string | null {
  if (text === undefined) return null;
  const masked = maskSecrets(text.slice(0, MAX_LEN * 2));
  return masked.length > MAX_LEN || text.length > MAX_LEN * 2 ? `${masked.slice(0, MAX_LEN)}…` : masked;
}
