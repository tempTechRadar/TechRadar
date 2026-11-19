// 위험 패턴 검사(SPEC-2 v1). 파일 글에서 문구로 찾는다. 같은 입력에는 늘 같은 결과(ADR 0003).
// 한계(화면에도 적는다): 찾지 못했다고 안전하다는 뜻은 아니다. 돌려 쓴 코드는 놓친다. 비밀값을 GET 주소에 붙여 보내는 코드,
// `session.post` 같은 다른 이름의 요청 객체, 문장으로 쓴 "키를 (주소)로 보내라"(SPEC-2 P2 둘째 줄)는 아직 못 찾는다.
// 또 비밀값을 읽는 줄과 보내는 줄이 15줄(P2_WINDOW)보다 멀면 같은 P2라도 '위험'이 아니라 '주의'로 남긴다: 다른 함수에 나눠 쓴 유출 코드나
// 공백·주석으로 거리를 벌린 코드는 '주의'로 낮아질 뿐 '통과'가 되지는 않는다(SPEC-3.1 보안 알림은 '위험'일 때만 난다).
// 바깥 저장소의 글은 읽기만 하고 실행하지 않는다.
import type { Grade } from "./grade.ts";
import { maskSecrets } from "./redact.ts";

export type PatternId = "P1" | "P2" | "P3";
export type SourceFile = { path: string; text: string };
/** grade: 이 발견 하나의 등급. P2는 읽는 곳과 가까우면 위험·같은 파일에서 멀면 주의라 패턴이 아니라 발견마다 정한다. */
export type RiskFinding = { pattern: PatternId; grade: "danger" | "caution"; file: string; line: number; excerpt: string; detail: string | null };
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

// P2: '비밀값을 읽는 곳'과 '바깥으로 보내는 곳'이 가까이(P2_WINDOW줄 안) 있음. 같은 파일이라는 이유만으로는 '위험'으로 걸지 않는다(멀면 '주의'):
// 키를 읽어 정상 API를 부르는 보통 서버가 멀리 떨어진 줄에서 부르는 경우가 흔하다(사용자 결정 2026-11-18, SPEC-2).
// shortcut: 15는 제안값이다. 대가 둘: ① 멀리 떨어진 읽기·보내기(정상 API 호출이든 다른 함수에 나눠 쓴 유출 코드든)는 '위험'이 못 되고 '주의'가 되며
// ② 가까운 정상 API 호출은 여전히 '위험'으로 걸린다. 둘 다 키가 요청 본문·다른 주소로 가는지를 문장 단위로 보면 줄어든다(I-P-10-p2-nearby-lines 열린 질문)
const P2_WINDOW = 15;
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

type Span = { at: number; end: number }; // 이어 쓴 명령이면 여러 줄(at = 첫 줄, end = 끝 줄)
type Logical = Span & { line: string };

/** 줄 끝 `\`로 이어 쓴 명령은 한 줄로 합친다(줄 번호는 첫 줄, end는 끝 줄). */
function logicalLines(text: string): Logical[] {
  const rows = text.split(/\r?\n/);
  const out: Logical[] = [];
  let buf = "";
  let at = 0;
  rows.forEach((raw, i) => {
    if (buf === "") at = i + 1;
    if (/\\\s*$/.test(raw)) {
      buf += `${raw.replace(/\\\s*$/, "")} `;
      return;
    }
    out.push({ line: buf + raw, at, end: i + 1 });
    buf = "";
  });
  if (buf) out.push({ line: buf, at, end: rows.length });
  return out;
}

function scanFile({ path, text }: SourceFile): { findings: RiskFinding[]; skipped: number } {
  const findings: RiskFinding[] = [];
  const add = (l: Logical, f: { pattern: PatternId; grade: RiskFinding["grade"]; detail?: string }) =>
    findings.push({ ...f, detail: f.detail ?? null, file: path, line: l.at, excerpt: maskLine(l.line.trim()).slice(0, 160) });
  const reads: Span[] = []; // 비밀값을 읽는 곳(줄 번호 순)
  const sends: Logical[] = [];
  let skipped = 0;
  for (const l of logicalLines(text)) {
    if (l.line.length > MAX_LINE) {
      skipped++;
      continue;
    }
    if (hit(P1, l.line)) add(l, { pattern: "P1", grade: "danger" });
    if (hit(P3, l.line)) add(l, { pattern: "P3", grade: "caution" });
    if (hit(SECRET_READ, l.line)) reads.push({ at: l.at, end: l.end });
    if (hit(SEND, l.line)) sends.push(l);
  }
  // 가장 가까운 짝이 15줄 안이면 위험, 멀어도 같은 파일에 둘 다 있으면 '통과'로 두지 않고 주의
  const pair = closestPair(reads, sends);
  if (pair) {
    const near = pair.dist <= P2_WINDOW;
    add(pair.send, { pattern: "P2", grade: near ? "danger" : "caution", detail: `비밀값을 읽는 곳: ${pair.readAt}째 줄${near ? "" : `(${pair.dist}줄 떨어짐)`}` });
  }
  return { findings, skipped };
}

type Pair = { send: Logical; readAt: number; dist: number };

/**
 * 읽는 줄과 보내는 줄의 짝 중 거리가 가장 짧은 것(같으면 먼저 나온 보내는 줄).
 * 두 목록이 줄 번호 순이라 포인터 하나로 훑어 줄 수에 비례한다: 바깥 저장소가 만든 큰 파일에서 오래 걸리지 않게(MAX_LINE과 같은 이유).
 */
function closestPair(reads: Span[], sends: Logical[]): Pair | undefined {
  let best: Pair | undefined;
  let i = 0;
  for (const send of sends) {
    while (i < reads.length && reads[i].at < send.at) i++;
    const read = nearestRead(reads, i, send);
    if (read && (!best || read.dist < best.dist)) best = { send, ...read };
  }
  return best;
}

/** reads[i - 1]은 보내는 줄 앞, reads[i]는 같은 줄이거나 뒤: 더 가까운 쪽(같으면 앞쪽)의 줄 번호와 거리. 이어 쓴 명령은 가까운 끝에서 잰다. */
function nearestRead(reads: Span[], i: number, send: Logical): { readAt: number; dist: number } | undefined {
  const before = i > 0 ? { readAt: reads[i - 1].at, dist: Math.max(0, send.at - reads[i - 1].end) } : undefined;
  const after = i < reads.length ? { readAt: reads[i].at, dist: Math.max(0, reads[i].at - send.end) } : undefined;
  return before && after ? (after.dist < before.dist ? after : before) : (before ?? after);
}

// 로케일에 따라 순서가 달라지지 않게 글자 코드 순으로 비교한다.
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const severity = (f: RiskFinding) => (f.grade === "caution" ? 1 : 0);

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
 * SPEC-1 위험 ②(P1·P2의 가까운 짝) · 주의 ⑤(P3·P2의 먼 짝). 읽은 파일이 없거나 검사하지 못한 줄이 있으면
 * 못 찾은 것을 '통과'로 내보내지 않고 '찾지 못함'으로 둔다.
 */
export function gradeFromScan({ findings, skippedLines }: ScanResult, scannedFiles: number): RiskGrade {
  // 목록 순서를 믿지 않는다: 합치거나 걸러 만든 목록에서도 위험이 하나라도 있으면 위험이다
  const first = findings.find((x) => x.grade === "danger") ?? findings[0];
  if (first) {
    const apart = first.pattern === "P2" && first.grade === "caution" ? " 비밀값을 읽는 곳과 떨어져 있어 '주의'로 봤어요." : "";
    // 주의로 끝날 때도 검사하지 못한 줄은 가리지 않는다(그 줄에 위험한 글이 있을 수 있다)
    const unchecked = first.grade === "caution" && skippedLines > 0 ? ` 너무 긴 줄 ${skippedLines}개는 검사하지 못했어요(그 줄에 위험한 글이 있을 수 있어요).` : "";
    return { grade: first.grade, reason: `${first.file} ${first.line}째 줄에서 '${PATTERN_NAME[first.pattern]}'(${first.pattern})로 보이는 글을 찾았어요.${apart}${unchecked}`, findings };
  }
  if (scannedFiles === 0) return { grade: "unknown", reason: "확인할 파일을 읽지 못했어요.", findings };
  if (skippedLines > 0) return { grade: "unknown", reason: `너무 긴 줄 ${skippedLines}개는 검사하지 못했어요. 찾지 못했다고 안전하다는 뜻은 아니에요.`, findings };
  return { grade: "pass", reason: "검사가 찾은 위험한 글은 없어요. 찾지 못했다고 안전하다는 뜻은 아니에요.", findings };
}
