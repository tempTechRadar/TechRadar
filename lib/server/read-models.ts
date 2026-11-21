// 저장소 코드 속 지원 종료 모델 찾기(PRD-F38, SPEC-3.3). 트리 1번(GitHub API) + 고른 코드 파일(raw). 주인: 김영식 A.
// "모델이 없다"(찾지 못함)와 "못 읽었다"(수집 오류)는 다르다(불변 2). 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import { repoApiUrl } from "../domain/github-repo.ts";
import { REPO_FILES, type FoundTech } from "../domain/manifest.ts";
import { codeFilesOf, findEolModels, modelFound } from "../domain/model-eol.ts";
import { CollectError, TOKEN_SHAPE, errorKindOf, fetchText, messageOf, rawFileUrl, type ErrorKind } from "./collect-fetch.ts";

/** 코드 파일 전체를 가리키는 오류 자리. onlyUnread = 이번에 못 본 모델 줄만(읽은 줄은 덮지 않게) */
export const CODE_FILES = "(코드 파일)";
export type ModelError = { path: string; kind: ErrorKind; message: string; onlyUnread?: boolean };
/** treePaths = 저장소의 모든 파일 경로(연동 서비스 · 개념 찾기 · 스킬 검사가 쓴다). 목록을 못 읽으면 빈 목록. treeComplete = 목록을 잘리지 않고 끝까지 받음, treeUnseen = 내용을 볼 수 없는 항목(링크 · 서브모듈 · 너무 긴 경로) */
export type ModelRead = { found: FoundTech[]; errors: ModelError[]; scanned: number; treePaths: string[]; treeComplete: boolean; treeUnseen: string[] };

const BATCH = 10; // 한꺼번에 여는 파일 수: 100개를 동시에 열면 GitHub raw가 끊는다
const BUDGET_MS = 25_000; // 코드 읽기에 쓰는 시간: 느린 날에도 뒤의 OSV · 저장이 함수 시간 안에 끝나게
const MAX_TREE = 8_000_000; // 파일 목록은 크다(항목 하나 약 200자). GitHub는 이보다 크면 스스로 자른다(truncated)
const ALREADY_READ = new Set<string>(REPO_FILES); // 다른 단계가 읽는 파일은 다시 받지 않는다(두 번째 받기 실패가 그 파일 줄을 덮지 않게)

type Deps = { token?: string; now?: () => number };

/** 파일 목록 읽기. 토큰이 있으면 붙이고(한도 60 → 5,000번/시간), 토큰이 거절되면(401) 없이 한 번 더. 빈 저장소(409)는 파일 없음 */
async function readTree(repo: { owner: string; repo: string }, token: string | undefined): Promise<string | null> {
  const url = `${repoApiUrl(repo)}/git/trees/HEAD?recursive=1`;
  const accept = { accept: "application/vnd.github+json" };
  try {
    return await fetchText(url, { headers: token ? { ...accept, authorization: `Bearer ${token}` } : accept }, MAX_TREE);
  } catch (e) {
    if (e instanceof CollectError && e.httpStatus === 409) return null;
    if (!(token && e instanceof CollectError && e.httpStatus === 401)) throw e;
    return readTree(repo, undefined);
  }
}

export async function readModels(repo: { owner: string; repo: string }, deps: Deps = {}): Promise<ModelRead> {
  const out: ModelRead = { found: [], errors: [], scanned: 0, treePaths: [], treeComplete: false, treeUnseen: [] };
  const now = deps.now ?? Date.now;
  const started = now();
  const raw = (deps.token ?? process.env.GITHUB_TOKEN)?.trim();
  let files: { paths: string[]; skipped: number; truncated: boolean; all: string[] };
  try {
    const tree = await readTree(repo, raw && TOKEN_SHAPE.test(raw) ? raw : undefined);
    if (tree === null) return out; // 빈 저장소. 저장소가 안 열린 경우는 첫 읽기가 closedRepoErrors로 먼저 가른다
    const parsed = codeFilesOf(tree, ALREADY_READ);
    if (parsed === null) throw new CollectError("parse", `${CODE_FILES}: 파일 목록의 모양이 달라 해석하지 못함`);
    files = parsed;
    out.treePaths = parsed.all;
    out.treeComplete = !parsed.truncated;
    out.treeUnseen = parsed.unseen;
  } catch (e) {
    out.errors.push({ path: CODE_FILES, kind: errorKindOf(e), message: messageOf(e) });
    return out;
  }
  const failures: unknown[] = [];
  let unread = files.skipped;
  for (let i = 0; i < files.paths.length; i += BATCH) {
    if (now() - started > BUDGET_MS) { unread += files.paths.length - i; break; }
    const reads = await Promise.all(files.paths.slice(i, i + BATCH).map(async (path) => {
      try {
        return { path, text: await fetchText(rawFileUrl(repo, path)) };
      } catch (e) {
        return { path, failure: e };
      }
    }));
    for (const x of reads) {
      if ("failure" in x) failures.push(x.failure);
      else if (x.text !== null) {
        out.scanned++;
        out.found.push(...findEolModels(x.text).map((n) => modelFound(n, x.path)));
      }
    }
  }
  // 못 본 곳(한도 · 크기 · 시간 · 열지 못한 파일)에 있던 모델 줄은 "사라짐"이 아니라 수집 오류. 오류는 하나로 모아 DB 갱신도 한 번
  const gaps = [
    unread ? `코드 파일 ${unread}개는 한도(수 · 크기 · 시간) 때문에 보지 못함` : "",
    files.truncated ? "GitHub가 파일 목록을 잘라 줌" : "",
    failures.length ? `코드 파일 ${failures.length}개를 열지 못함(${messageOf(failures[0])})` : "",
  ].filter(Boolean);
  if (gaps.length) out.errors.push({ path: CODE_FILES, kind: failures.length ? errorKindOf(failures[0]) : "parse", onlyUnread: true, message: `모델 찾기: ${gaps.join(" · ")}` });
  return out;
}
