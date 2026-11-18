// 위험 패턴 검사(SPEC-2 v1). 파일 글에서 문구로 찾는다. 같은 입력에는 늘 같은 결과(ADR 0003).
// 한계(화면에도 적는다): 찾지 못했다고 안전하다는 뜻은 아니다. 돌려 쓴 코드는 놓친다. 비밀값을 GET 주소에 붙여 보내는 코드,
// `session.post` 같은 다른 이름의 요청 객체, 문장으로 쓴 "키를 (주소)로 보내라"(SPEC-2 P2 둘째 줄)는 아직 못 찾는다.
// 바깥 저장소의 글은 읽기만 하고 실행하지 않는다.
import type { Grade } from "./grade.ts";
import { maskSecrets } from "./redact.ts";

export type PatternId = "P1" | "P2" | "P3";
export type SourceFile = { path: string; text: string };
export type RiskFinding = { pattern: PatternId; file: string; line: number; excerpt: string; detail: string | null };
/** skippedLines: 너무 길어 검사하지 못한 줄 수. 0이 아니면 '찾지 못했다'를 '통과'로 읽으면 안 된다. */
export type ScanResult = { findings: RiskFinding[]; skippedLines: number };
export type RiskGrade = { grade: Grade; reason: string; findings: RiskFinding[] };

export const PATTERN_NAME: Record<PatternId, string> = { P1: "원격 실행", P2: "비밀값 밖으로 보내기", P3: "넓은 권한" };

// 압축된 한 줄짜리 파일에서 정규식이 오래 도는 것을 막는다. 건너뛴 줄은 세어 두었다가 등급이 '통과'로 나가지 않게 한다.
const MAX_LINE = 2000;
const MAX_FINDINGS = 50;

// P1: curl … | sh, sh -c "$(curl …)", eval "$(curl …)", iwr … | iex, 내려받은 글을 eval·exec
const P1: RegExp[] = [
  /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:(?:ba|z|da)?sh\b|(?:python3?|node|perl|ruby)\s+-(?:\s|$))/i,
  /\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b[^\n]*\|\s*(?:iex|Invoke-Expression)\b/i,
  /\b(?:iex|Invoke-Expression)\b[^\n]*\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b/i,
  /\b(?:(?:ba|z|da)?sh|eval|source)\b\s+(?:-\w+\s+)*["']?(?:<\(|\$\()\s*(?:curl|wget)\b/i,
  /(?<![\w.])(?:eval|exec)\s*\([^;\n]*?\b(?:fetch|requests\.get|urlopen|axios|http\.get)\b/i,
];

// P2: 같은 파일에 '비밀값을 읽는 곳'과 '바깥으로 보내는 곳'이 함께 있음(SPEC-2 그대로)
// 이름만 있는 MAX_TOKENS·CSRF_TOKEN 같은 글자는 읽는 곳이 아니다 → 환경변수를 읽는 모양일 때만 이름을 본다.
const SECRET_READ: RegExp[] = [
  /(?<!\w)\.env\b|~\/\.ssh|\.ssh\/|\bid_rsa\b/,
  /(?:process\.env(?:\.|\[["'])|os\.environ(?:\.get\(|\[)["']?|(?:os\.)?getenv\(["']|\$env:|\$\{?)[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET_KEY|SECRET)\b/,
];
// curl 옵션은 대소문자를 구분한다(-f 내려받기 실패 처리 ≠ -F 파일 올리기).
const SEND: RegExp[] = [
  /\bfetch\s*\(/,
  /\b(?:axios|httpx|requests)\.(?:post|put|request)\b/,
  /\b(?:urllib\.request\.urlopen|http\.request)\b/,
  /\bcurl\b[^\n]*(?:\s-d\b|\s--data\S*|\s--json\b|\s-F\b|\s--form\b|\s-T\b|\s--upload-file\b|\s-X\s*(?:POST|PUT|post|put)\b)/,
  /\bwget\b[^\n]*--post-\S+/,
  /\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*-Method\s+(?:Post|Put)\b/i,
];

// P3: Bash(*), allowed-tools 전체, Bash만 적음(= 셸 명령 전체), 홈 폴더 전체 읽기·쓰기
// shortcut: allowed-tools를 여러 줄 목록(- Bash)으로 적은 것은 못 찾는다. 놓친 사례가 나오면 앞 줄 문맥을 보게
const P3: RegExp[] = [
  /\bBash\(\s*\*\s*\)/,
  /^\s*allowed-tools\s*:\s*["']?\*["']?\s*$/i,
  /^\s*allowed-tools\s*:[^\n]*\bBash\b(?!\s*\()/i,
  /\b(?:Read|Write|Edit)\(\s*(?:~|\$HOME)[\\/]?\*{0,2}\s*\)/i,
];

const hit = (res: RegExp[], line: string) => res.some((re) => re.test(line));

// maskSecrets가 못 잡는 소문자 머리글·옵션(x-api-key: …, --token …, Authorization: Basic …)까지 가린다. 지나치게 가리는 쪽이 안전하다.
const LOWER_SECRET = /((?:x-api-key|api[-_]?key|authorization|token|secret|password)\b["']?\s*[:=\s]\s*(?:(?:Basic|Bearer)\s+)?)["']?[^\s"',;&]+/gi;
const maskLine = (s: string) => maskSecrets(s).replace(LOWER_SECRET, "$1***");

type Logical = { line: string; at: number };

/** 줄 끝 `\`로 이어 쓴 명령은 한 줄로 합친다(줄 번호는 첫 줄). */
function logicalLines(text: string): Logical[] {
  const out: Logical[] = [];
  let buf = "";
  let at = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    if (buf === "") at = i + 1;
    if (/\\\s*$/.test(raw)) {
      buf += `${raw.replace(/\\\s*$/, "")} `;
      return;
    }
    out.push({ line: buf + raw, at });
    buf = "";
  });
  if (buf) out.push({ line: buf, at });
  return out;
}

function scanFile({ path, text }: SourceFile): { findings: RiskFinding[]; skipped: number } {
  const findings: RiskFinding[] = [];
  const add = (pattern: PatternId, l: Logical, detail: string | null = null) =>
    findings.push({ pattern, file: path, line: l.at, excerpt: maskLine(l.line.trim()).slice(0, 160), detail });
  let read: Logical | undefined;
  let send: Logical | undefined;
  let skipped = 0;
  for (const l of logicalLines(text)) {
    if (l.line.length > MAX_LINE) {
      skipped++;
      continue;
    }
    if (hit(P1, l.line)) add("P1", l);
    if (hit(P3, l.line)) add("P3", l);
    if (!read && hit(SECRET_READ, l.line)) read = l;
    if (!send && hit(SEND, l.line)) send = l;
  }
  if (read && send) add("P2", send, `비밀값을 읽는 곳: ${read.at}째 줄`);
  return { findings, skipped };
}

// 로케일에 따라 순서가 달라지지 않게 글자 코드 순으로 비교한다.
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const severity = (f: RiskFinding) => (f.pattern === "P3" ? 1 : 0);

/**
 * 파일마다 줄 단위로 찾는다. 위험(P1·P2)을 먼저, 그다음 (파일, 줄, 패턴) 순으로 정렬해
 * 입력 순서와 상관없이 같고, 50개로 자를 때도 등급을 정하는 위험이 밀려나지 않는다.
 */
export function scanRiskPatterns(files: SourceFile[]): ScanResult {
  const scanned = files.map(scanFile);
  const findings = scanned
    .flatMap((s) => s.findings)
    .sort((a, b) => severity(a) - severity(b) || byCode(a.file, b.file) || a.line - b.line || byCode(a.pattern, b.pattern))
    .slice(0, MAX_FINDINGS);
  return { findings, skippedLines: scanned.reduce((n, s) => n + s.skipped, 0) };
}

/**
 * SPEC-1 위험 ②(P1·P2) · 주의 ⑤(P3). 읽은 파일이 없거나 검사하지 못한 줄이 있으면
 * 못 찾은 것을 '통과'로 내보내지 않고 '찾지 못함'으로 둔다.
 */
export function gradeFromScan({ findings, skippedLines }: ScanResult, scannedFiles: number): RiskGrade {
  const first = findings[0];
  if (first) {
    const grade: Grade = first.pattern === "P3" ? "caution" : "danger";
    return { grade, reason: `${first.file} ${first.line}째 줄에서 '${PATTERN_NAME[first.pattern]}'(${first.pattern})로 보이는 글을 찾았어요.`, findings };
  }
  if (scannedFiles === 0) return { grade: "unknown", reason: "확인할 파일을 읽지 못했어요.", findings };
  if (skippedLines > 0) return { grade: "unknown", reason: `너무 긴 줄 ${skippedLines}개는 검사하지 못했어요. 찾지 못했다고 안전하다는 뜻은 아니에요.`, findings };
  return { grade: "pass", reason: "검사가 찾은 위험한 글은 없어요. 찾지 못했다고 안전하다는 뜻은 아니에요.", findings };
}
