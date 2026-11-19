// 실행 기록(run_steps)·오류 메시지를 저장하기 전에 비밀값처럼 보이는 글자를 ***로 바꾼다(SPEC-8).
// 공개 저장소의 .mcp.json에 실수로 들어간 키가 기록에 남지 않게 한다. 지나치게 가리는 쪽이 안전하다.
const MASK = "***";
const MAX_LEN = 2000;

// 이름 끝이 KEY·TOKEN·SECRET·PASSWORD인 대문자 변수: SUPABASE_SERVICE_ROLE_KEY=값, TOKEN: 값
const NAMED = /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"']+)/g;
// 주소 뒤에 붙은 ?token=…&api_key=…
const QUERY = /([?&][\w-]*(?:key|token|secret|password)[\w-]*=)[^&\s#]+/gi;
// 비밀값 한 덩어리: ASCII 영문·숫자·기호(따옴표·괄호·꺾쇠·쉼표·;·&·| 빼고)가 이어진 만큼. 한국어·꺾쇠가 바로 붙으면 거기서 끊는다
const VALUE_CHAR = /[!#$%*+\-./0-9:=?@A-Z\^_a-z~]/.source;
// 자리표시자($API_KEY·${…}·<your-token>·{{TOKEN}})와 다음 옵션(--verbose)은 값이 아니다. 설치 안내 줄을 비밀값으로 거르지 않게(looksSecret)
const NOT_VALUE = String.raw`(?![$<{]|--)`;
const PLAIN_VALUE = `${NOT_VALUE}${VALUE_CHAR}+`;
// 따옴표 값은 띄어쓰기까지 통째로, 따옴표는 남긴다: 머리 끝의 (["']) 와 같은 따옴표까지
const QUOTED_VALUE = String.raw`(?![$<{])(?:(?!\2)[^\n])+(?=\2)`;
// 소문자도 보는 이름: 앞말이 붙어도 된다(client_secret·refresh_token·db_password·x-api-key).
// key는 흔한 이름(tech_key·dedupe_key)이 많아 비밀 쪽 앞말(api·private·client…)이 붙은 것만 본다
const NAME = String.raw`(?:[a-z0-9]+[-_])*(?:token|secret|passw(?:or)?d|authorization|(?:api|private|secret|access|client|signing|encryption|master|ssh|auth)[-_]?key)`;
// 머리글·JSON 칸·설정 줄: x-api-key: 값, authorization: bearer 값, "api_key":"값", password=값 (줄바꿈은 넘지 않는다)
const HEADER = String.raw`(?<![\w-])${NAME}["']?[ \t]*[:=][ \t]*`;
// 명령 옵션: --token 값, --token=값, --api-key '값' (이름 전체가 비밀 쪽 낱말일 때만: --monkey는 아님)
const FLAG = String.raw`(?<![\w-])--${NAME}(?:=|[ \t]+)`;
const LOWER_RULES = [
  `(${HEADER}(["']))${QUOTED_VALUE}`,
  String.raw`(${HEADER}(?:(?:bearer|basic|token)[ \t]+)?)${PLAIN_VALUE}`,
  `(${FLAG}(["']))${QUOTED_VALUE}`,
  `(${FLAG})${PLAIN_VALUE}`,
].map((source) => new RegExp(source, "gi"));
// 모양만 봐도 키인 것
const SHAPES: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{8,}/g, // Anthropic·OpenAI류
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g, // GitHub 토큰
  /\bsb_secret_[A-Za-z0-9_-]{8,}/g, // Supabase 비밀 키
  /\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, // JWT(서비스 키 포함)
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g,
];

export function maskSecrets(text: string): string {
  let out = [NAMED, QUERY, ...LOWER_RULES].reduce((acc, re) => acc.replace(re, `$1${MASK}`), text);
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
