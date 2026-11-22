// 바깥 호출 어댑터(GitHub·OSV). 실패는 오류 종류(SPEC-8)로 나눠 던진다. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { repoApiUrl } from "../domain/github-repo.ts";
import { forPackage, type OsvVuln } from "../domain/grade.ts";
import type { StepRecord } from "./run-log.ts";

const MAX_TEXT = 500_000; // 파일·응답 한도(글자)
// 헤더 값에 그대로 들어가므로 글자를 좁게 잡는다(줄바꿈·공백이 섞이면 fetch가 그 값을 오류 문구에 그대로 되풀이한다). 고전·세분화·구형 토큰이 모두 맞는다
export const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,255}$/;
export const OSV_QUERY_URL = "https://api.osv.dev/v1/query";

export type ErrorKind = NonNullable<StepRecord["errorKind"]>;

/** GitHub 서버 토큰. 없거나 모양이 이상하면 호출 없이 수집 오류(저장소 정보·별 후보 수집기가 함께 쓴다). 값은 문구에 넣지 않는다. */
export function readToken(token: string | undefined): string {
  const t = token?.trim();
  if (!t) throw new CollectError("http_status", "서버 환경변수 GITHUB_TOKEN이 없어 GitHub를 부르지 않았어요(Vercel·.env에 넣어야 함)");
  if (!TOKEN_SHAPE.test(t)) throw new CollectError("http_status", "서버 환경변수 GITHUB_TOKEN의 모양이 이상해 GitHub를 부르지 않았어요(공백·줄바꿈·따옴표가 섞였는지 확인, 값은 기록하지 않음)");
  return t;
}

export class CollectError extends Error {
  readonly kind: ErrorKind;
  readonly httpStatus?: number;
  constructor(kind: ErrorKind, message: string, httpStatus?: number) {
    super(message);
    this.kind = kind;
    this.httpStatus = httpStatus;
  }
}

/** 공개 저장소가 아님: 주소가 틀렸거나 비공개(GitHub는 둘 다 404). 화면에 이유를 보여 줄 때 구분해서 쓴다. */
export class RepoNotPublicError extends CollectError {
  constructor(repoPath: string) {
    super("http_status", `${repoPath}: 저장소를 열 수 없음(404) — 주소가 틀렸거나 비공개`, 404);
  }
}

// 연결을 못 하거나 본문을 읽다 끊긴 것: 시간 초과면 timeout, 그 밖에는 network
const connectionFailure = (url: string, e: unknown) =>
  new CollectError(e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network", `${url}: ${e instanceof Error ? e.message : String(e)}`);

/** 바깥 호출 하나. 404는 null(없음). 그 밖의 실패는 CollectError로 던진다. maxText는 큰 응답(저장소 파일 목록·OSV 조회)만 늘린다 */
export async function fetchText(url: string, init?: RequestInit, maxText = MAX_TEXT): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch (e) {
    throw connectionFailure(url, e);
  }
  if (res.status === 404) return null;
  // GitHub의 한도 초과는 429뿐 아니라 403 + x-ratelimit-remaining: 0, 그리고 2차 한도(남은 횟수는 있는데 403 + retry-after)로도 온다
  if (res.status === 429 || (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")))) {
    throw new CollectError("rate_limited", `${url}: ${res.status}`, res.status);
  }
  if (!res.ok) throw new CollectError("http_status", `${url}: ${res.status}`, res.status);
  let text: string;
  try {
    text = await res.text(); // 본문을 읽다 시간 초과·끊김이 나도 그 호출만 수집 오류(불변 2)
  } catch (e) {
    throw connectionFailure(url, e);
  }
  if (text.length > maxText) throw new CollectError("parse", `${url}: 응답이 너무 큼(${text.length}자)`);
  return text;
}

export const errorKindOf = (e: unknown): ErrorKind => (e instanceof CollectError ? e.kind : "parse");
export const messageOf = (e: unknown) => String(e instanceof Error ? e.message : e);

/** 저장소 파일 하나의 raw 주소(기본 가지). 경로는 칸마다 인코딩한다 */
export const rawFileUrl = (repo: { owner: string; repo: string }, path: string) =>
  `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/HEAD/${path.split("/").map(encodeURIComponent).join("/")}`;

const OSV_PAGE_GAP_MS = 1000;
// 옛 버전·버전 없는 조회는 취약점 전문이 한 쪽에 다 와서 크다(litellm 버전 없이 약 70만 자). 기본 한도로는 취약점이 많을수록 매번 수집 오류가 된다
const OSV_MAX_TEXT = 8_000_000;
const OSV_MAX_PAGES = 10; // 취약점이 아주 많은 패키지도 이 안에 끝난다. 넘으면 다 읽지 못한 것이라 수집 오류

/** OSV 한 쪽을 읽는다: 취약점 목록과 다음 쪽 표시(없거나 빈 문자열이면 마지막 쪽). 모양이 다르면 parse 오류. */
function readOsvPage(text: string, name: string): { vulns: OsvVuln[]; nextToken: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CollectError("parse", "OSV 응답을 해석하지 못함");
  }
  // 객체이고 vulns가 있으면 배열일 때만 "없음"({})·목록으로 읽는다. 그 밖의 모양(`[]`, 숫자, null)을 조용히 "없음"으로 읽지 않는다.
  const page = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as { vulns?: unknown; next_page_token?: unknown }) : null;
  const token = page?.next_page_token;
  if (page === null || (page.vulns !== undefined && !Array.isArray(page.vulns)) || (token !== undefined && typeof token !== "string")) {
    throw new CollectError("parse", "OSV 응답의 모양이 달라 해석하지 못함");
  }
  try {
    return { vulns: forPackage((page.vulns ?? []) as OsvVuln[], name), nextToken: token || null };
  } catch {
    // null 항목 같은 이상한 응답이 코드 오류로 터져 그날의 모든 확인을 멈추지 않게: 그 호출만 해석 실패
    throw new CollectError("parse", "OSV 응답의 취약점 항목 모양이 달라 해석하지 못함");
  }
}

/** 알려진 취약점. 결과가 많아 OSV가 쪽을 나누면(next_page_token) 끝까지 따라가 모은다: 첫 쪽만으로 "없음"이라 하지 않는다(불변 2). */
export async function queryOsv(name: string, ecosystem: "npm" | "PyPI", version: string | null, pageGapMs = OSV_PAGE_GAP_MS): Promise<OsvVuln[]> {
  const all: OsvVuln[] = [];
  const seen = new Set<string>();
  let pageToken: string | null = null;
  for (let page = 0; page < OSV_MAX_PAGES; page++) {
    if (page > 0 && pageGapMs > 0) await new Promise((r) => setTimeout(r, pageGapMs)); // 같은 출처 요청 간격 1초 이상(SPEC-8)
    const body = JSON.stringify({ package: { name, ecosystem }, ...(version ? { version } : {}), ...(pageToken ? { page_token: pageToken } : {}) });
    const text = await fetchText(OSV_QUERY_URL, { method: "POST", body, headers: { "content-type": "application/json" } }, OSV_MAX_TEXT);
    // OSV는 취약점이 없어도 200({})으로 답한다. 404(null)는 주소·서버 문제라 "없음"이 아니라 수집 오류(불변 2).
    if (text === null) throw new CollectError("http_status", `${OSV_QUERY_URL}: 404`, 404);
    const { vulns, nextToken } = readOsvPage(text, name);
    all.push(...vulns);
    if (nextToken === null) return all;
    if (seen.has(nextToken)) throw new CollectError("parse", "OSV가 같은 다음 쪽 표시를 되풀이해 다 읽지 못함");
    seen.add(nextToken);
    pageToken = nextToken;
  }
  throw new CollectError("parse", `OSV 결과가 ${OSV_MAX_PAGES}쪽을 넘어 다 읽지 못함`);
}

/**
 * 공개 저장소인지 확인한다. 안 열리면(404·비공개) RepoNotPublicError.
 * 한도 초과·네트워크 같은 실패는 CollectError 그대로 던진다: 없다고 단정하지 않는다(불변 2).
 */
export async function assertRepoPublic(repo: { owner: string; repo: string }): Promise<void> {
  const path = `${repo.owner}/${repo.repo}`;
  // shortcut: 인증 없이 부름(시간당 60회). 서버 토큰(ADR 0008 4번)은 P-9에서 붙이면서 함께
  const url = repoApiUrl(repo); // `.`·`..` 이름을 막는 주소 만들기를 한 곳에 둔다
  const text = await fetchText(url, { headers: { accept: "application/vnd.github+json" } });
  if (text === null) throw new RepoNotPublicError(path);
  let info: { private?: boolean };
  try {
    info = JSON.parse(text);
  } catch {
    throw new CollectError("parse", `${path}: GitHub 응답을 해석하지 못함`);
  }
  if (info.private) throw new RepoNotPublicError(path);
}
