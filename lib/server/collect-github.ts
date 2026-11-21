// GitHub 저장소 정보 수집기(P-9b, SPEC-8, 흐름 상자 fetch_github). 주인: 김영식 A.
// 두꺼운 기술의 저장소를 저장소마다 1번 읽어(같은 저장소를 가리키는 기술이 여럿이면 한 번 읽어 모두에 적용) 마지막 푸시·라이선스·별을 저장하고,
// 보관·12개월 무활동·404 두 번으로 상태를 정한다(데이터설계 8절, ADR 0021). 바뀐 값만 수집 자료로 남기고(불변 3),
// 일부 기술만 실패하면 그 기술의 이전 값을 그대로 두고 collect_error 줄에 센다(불변 2·4).
// 서버 토큰(GITHUB_TOKEN)이 없거나 모양이 이상하면 호출하지 않고 수집 오류로 멈춘다("변화 없음"으로 보이지 않게, 값은 오류 문구에도 안 넣음).
// 한도 초과(1차·2차)나 토큰 거절(401)이 나면 이번 실행에서 더 부르지 않는다. 저장 규칙은 github-store.ts.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { repoKey, type RepoInfo, type RepoRef } from "../domain/github-repo.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { CollectError, readToken, type ErrorKind } from "./collect-fetch.ts";
import { countKinds } from "./collect-util.ts";
import { fetchRepoInfo } from "./github-fetch.ts";
import { markFailed, markTried, readSource, readTargets, saveFound, saveMissing, type Target } from "./github-store.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // SPEC-8: 요청 사이 1초 이상
// 묶음 시간 예산(240초) 중 GitHub의 몫: 저장소마다 1번·1초 간격이라 한 실행에 60곳 안팎. 넘치는 것은 오래 안 읽은 순서로 다음 실행이 읽는다
const GITHUB_BUDGET_MS = 60_000;
// 2차 한도(남용 방지)·정지된 토큰·권한 없는 토큰은 한도 머리글 없이 403만 온다. 저장소 하나만 막힌 403(접근 차단)과 구별되지 않으므로 서로 다른 저장소에서 연달아 2번 나오면 멈춘다
const FORBIDDEN_IN_ROW_TO_STOP = 2;

type Deps = { fetchRepo: (ref: RepoRef, token: string) => Promise<RepoInfo | null>; token: () => string | undefined; sleep: (ms: number) => Promise<void>; now: () => number };
type Failure = { key: string; kind: ErrorKind; message: string; httpStatus?: number };
type Group = { ref: RepoRef; techs: Target[] };
type Tally = { read: number; missing: number; changed: number; failed: Failure[]; skipped: number; requests: number; blocked: boolean; forbiddenInRow: number };
type Run = { db: SupabaseClient; runId: string; sourceId: string; token: string; d: Deps; tally: Tally };

export function githubCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { fetchRepo: fetchRepoInfo, token: () => process.env.GITHUB_TOKEN, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_github", run: (ctx) => collectGithub(ctx, d) };
}

async function collectGithub(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const source = await readSource(ctx.db);
  if (!source.enabled) return { items: 0, summary: "GitHub 출처가 꺼져 있어요(관리자 설정)" };
  const token = readToken(d.token());
  const run: Run = { db: ctx.db, runId: ctx.runId, sourceId: source.id, token, d, tally: { read: 0, missing: 0, changed: 0, failed: [], skipped: 0, requests: 0, blocked: false, forbiddenInRow: 0 } };
  const groups = groupByRepo(await readTargets(ctx.db));
  try {
    await readEach(run, groups, Math.min(ctx.deadlineMs, d.now() + GITHUB_BUDGET_MS));
  } catch (e) {
    await recordSteps(run, false).catch(() => {}); // 저장 실패로 멈춰도 거기까지 저장한 것은 실행 기록에 남긴다(원래 오류는 가리지 않음)
    throw e;
  }
  const dead = run.tally.read === 0 && run.tally.failed.length > 0;
  await recordSteps(run, !dead); // 던질 때는 runBatch가 collect_error를 남기고, 자세한 내용은 던진 오류에 담긴다
  if (dead) throw deadSource(run.tally.failed);
  return { items: run.tally.read, summary: summarize(run.tally) };
}

/** 같은 저장소를 가리키는 기술(모노레포의 패키지들)을 묶는다. 순서는 가장 오래 안 읽은 기술이 있는 저장소부터. 소유자·저장소 이름의 대소문자는 같은 것으로 본다. */
function groupByRepo(targets: Target[]): Group[] {
  const groups = new Map<string, Group>();
  for (const t of targets) {
    const key = repoKey(t.ref);
    const g = groups.get(key);
    if (g) g.techs.push(t);
    else groups.set(key, { ref: t.ref, techs: [t] });
  }
  return [...groups.values()];
}

async function readEach(run: Run, groups: Group[], deadlineMs: number): Promise<void> {
  const { tally, d } = run;
  for (const [i, g] of groups.entries()) {
    if (tally.blocked || d.now() >= deadlineMs) {
      tally.skipped += groups.slice(i).reduce((n, rest) => n + rest.techs.length, 0); // 오래 안 읽어 본 것부터 읽으므로 못 읽은 쪽이 다음 실행에서 먼저 간다
      return;
    }
    await readGroup(run, g);
  }
}

/** 한 저장소: 한 번 읽고(수집 오류는 그 저장소의 기술마다 세어 두고 넘어감) 모든 기술에 저장한다(저장 실패·코드 버그는 던진다: 숨기지 않음). */
async function readGroup(run: Run, g: Group): Promise<void> {
  const { token, d, tally } = run;
  if (tally.requests++ > 0) await d.sleep(REQUEST_GAP_MS); // 요청을 하는 저장소 사이에서만 쉰다
  let info: RepoInfo | null;
  try {
    info = await d.fetchRepo(g.ref, token);
  } catch (e) {
    if (!(e instanceof CollectError)) throw e;
    tally.forbiddenInRow = e.httpStatus === 403 ? tally.forbiddenInRow + 1 : 0;
    for (const t of g.techs) await recordFailure(run, t, e);
    return;
  }
  tally.forbiddenInRow = 0; // 못 찾음(404)도 GitHub가 답한 것이라 연속 세기를 끊는다
  // 비공개 저장소는 공용 카탈로그에 정보를 넣지 않는다: 찾을 수 없는 것과 같게 본다
  const found = info !== null && !info.isPrivate ? info : null;
  for (const t of g.techs) await saveOne(run, t, found);
}

async function saveOne(run: Run, t: Target, found: RepoInfo | null): Promise<void> {
  const { db, runId, sourceId, d, tally } = run;
  const at = new Date(d.now()).toISOString();
  try {
    const changed = found ? await saveFound(db, { target: t, sourceId, runId, info: found, at }) : await saveMissing(db, { target: t, sourceId, runId, at });
    if (changed) tally.changed++;
  } catch (e) {
    await markTried(db, t.id, at).catch(() => {}); // 이 기술이 매번 맨 앞에서 멈춰 뒤의 기술이 굶지 않게 읽어 본 시각만 적는다
    throw e;
  }
  tally.read++;
  if (found === null) tally.missing++;
}

async function recordFailure(run: Run, t: Target, e: CollectError): Promise<void> {
  run.tally.failed.push({ key: t.key, kind: e.kind, message: e.message, httpStatus: e.httpStatus });
  // 한도 초과(1차·2차)와 토큰 거절(401), 한도 머리글 없는 403이 연달아 나오는 것은 더 불러 봐야 같다: 이번 실행은 여기서 멈춘다
  if (e.kind === "rate_limited" || e.httpStatus === 401 || run.tally.forbiddenInRow >= FORBIDDEN_IN_ROW_TO_STOP) run.tally.blocked = true;
  await markFailed(run.db, t.id, e.kind, new Date(run.d.now()).toISOString());
}

const deadSource = (failed: Failure[]) => new CollectError(failed[0].kind, `GitHub를 읽지 못했어요(${countKinds(failed)}). 첫 오류: ${failed[0].message}`, failed[0].httpStatus);

/**
 * 수집 상자 줄은 runBatch가 남긴다. 여기서는 그 뒤 단계(normalize·compare)와, 일부만 실패했을 때의 collect_error만 남긴다.
 * compare의 나가는 건수는 0이다: 저장소 정보는 등급 계산으로 넘어가지 않아 다른 수집기(OSV)의 compare→grade 숫자에 섞이면 안 된다.
 */
async function recordSteps({ db, runId, tally: t }: Run, withDetail: boolean): Promise<void> {
  if (t.read > 0) {
    await recordStep(db, runId, { stepName: "normalize", status: "succeeded", countIn: t.read, countOut: t.read, outputSummary: "저장소 정보를 (마지막 푸시, 라이선스, 별, 보관 여부) 모양으로 맞춤" });
    await recordStep(db, runId, {
      stepName: "compare", status: "succeeded", countIn: t.read, countOut: 0,
      outputSummary: `바뀐 것 ${t.changed}개(수집 자료로만 남김, 등급 계산으로 넘어가지 않음), 그대로 ${t.read - t.changed}개, 이 중 못 찾음 ${t.missing}개`,
    });
  }
  if (!withDetail || t.failed.length === 0) return;
  const names = t.failed.slice(0, 5).map((f) => f.key).join(", ");
  await recordStep(db, runId, {
    stepName: "collect_error", status: "succeeded", countIn: t.failed.length,
    outputSummary: `fetch_github ${t.failed.length}개 수집 오류(${countKinds(t.failed)}): ${names}. 기술마다 마지막 오류는 signals.github_error`,
    errorKind: t.failed[0].kind, errorMessage: t.failed[0].message,
  });
}

function summarize(t: Tally): string {
  const parts = [`GitHub 저장소 정보 ${t.read}개 읽음(바뀐 것 ${t.changed}개${t.missing ? `, 못 찾음 ${t.missing}개` : ""})`];
  if (t.failed.length) parts.push(`수집 오류 ${t.failed.length}개`);
  if (t.skipped) parts.push(`시간 한도·한도 초과로 ${t.skipped}개는 다음 실행으로`);
  return parts.join(", ");
}
