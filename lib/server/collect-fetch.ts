// 바깥 호출 어댑터(GitHub·OSV). 실패는 오류 종류(SPEC-8)로 나눠 던진다. 주인: 김영식 A.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { forPackage, type OsvVuln } from "../domain/grade.ts";
import type { StepRecord } from "./run-log.ts";

const MAX_TEXT = 500_000; // 파일·응답 한도(글자)

export type ErrorKind = NonNullable<StepRecord["errorKind"]>;

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

/** 바깥 호출 하나. 404는 null(없음). 그 밖의 실패는 CollectError로 던진다. */
export async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch (e) {
    const kind = e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
    throw new CollectError(kind, `${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.status === 404) return null;
  // GitHub의 한도 초과는 429뿐 아니라 403 + x-ratelimit-remaining: 0으로도 온다
  if (res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0")) {
    throw new CollectError("rate_limited", `${url}: ${res.status}`, res.status);
  }
  if (!res.ok) throw new CollectError("http_status", `${url}: ${res.status}`, res.status);
  const text = await res.text();
  if (text.length > MAX_TEXT) throw new CollectError("parse", `${url}: 응답이 너무 큼(${text.length}자)`);
  return text;
}

export const errorKindOf = (e: unknown): ErrorKind => (e instanceof CollectError ? e.kind : "parse");

export async function queryOsv(name: string, ecosystem: "npm" | "PyPI", version: string | null): Promise<OsvVuln[]> {
  const body = JSON.stringify({ package: { name, ecosystem }, ...(version ? { version } : {}) });
  const text = await fetchText("https://api.osv.dev/v1/query", { method: "POST", body, headers: { "content-type": "application/json" } });
  try {
    return forPackage((JSON.parse(text ?? "{}") as { vulns?: OsvVuln[] }).vulns ?? [], name);
  } catch {
    throw new CollectError("parse", "OSV 응답을 해석하지 못함");
  }
}

/**
 * 공개 저장소인지 확인한다. 안 열리면(404·비공개) RepoNotPublicError.
 * 한도 초과·네트워크 같은 실패는 CollectError 그대로 던진다: 없다고 단정하지 않는다(불변 2).
 */
export async function assertRepoPublic(repo: { owner: string; repo: string }): Promise<void> {
  const path = `${repo.owner}/${repo.repo}`;
  // shortcut: 인증 없이 부름(시간당 60회). 서버 토큰(ADR 0008 4번)은 P-9에서 붙이면서 함께
  const url = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
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
