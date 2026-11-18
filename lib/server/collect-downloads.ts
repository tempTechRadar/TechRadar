// npm·PyPI 주간 다운로드 수집기(P-9, SPEC-8, 흐름 상자 fetch_downloads). 주인: 김영식 A.
// 두꺼운 기술(depth=thick)의 다운로드를 읽어 signals.weekly_downloads에 넣고, 값이 바뀐 것만 수집 자료로 남긴다(불변 3).
// 일부 기술만 실패하면 그 기술의 이전 값을 그대로 두고 collect_error 줄에 센다(불변 2·4). 한쪽 출처가 통째로 실패하면 던져서
// runBatch가 수집 오류(재시도·3번 연속 강조)로 기록하게 한다. 저장 규칙은 downloads-store.ts.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ecosystem, PackageRef } from "../domain/downloads.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { CollectError, type ErrorKind } from "./collect-fetch.ts";
import { countKinds } from "./collect-util.ts";
import { fetchWeeklyDownloads } from "./downloads-fetch.ts";
import { markFailed, readSourceIds, readTargets, saveReading, SOURCE_NAME, type Target } from "./downloads-store.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // SPEC-8: 요청 사이 1초 이상
const ECOSYSTEMS: Ecosystem[] = ["npm", "pypi"];

type Deps = { fetchWeekly: (ref: PackageRef) => Promise<number>; sleep: (ms: number) => Promise<void>; now: () => number };
type Ready = Target & { sourceId: string };
type Failure = { key: string; ecosystem: Ecosystem; kind: ErrorKind; message: string };
type Tally = { readBy: Record<Ecosystem, number>; changed: number; failed: Failure[]; skipped: number; requests: number; blocked: Set<Ecosystem> };
type Run = { db: SupabaseClient; runId: string; d: Deps; tally: Tally };

export function downloadsCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { fetchWeekly: fetchWeeklyDownloads, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_downloads", run: (ctx) => collectDownloads(ctx, d) };
}

async function collectDownloads(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const sourceIds = await readSourceIds(ctx.db);
  if (!ECOSYSTEMS.some((e) => sourceIds[e])) return { items: 0, summary: "npm·PyPI 다운로드 출처가 모두 꺼져 있어요(관리자 설정)" };
  const targets = (await readTargets(ctx.db)).flatMap((t): Ready[] => {
    const sourceId = sourceIds[t.ecosystem];
    return sourceId ? [{ ...t, sourceId }] : [];
  });
  const run: Run = { db: ctx.db, runId: ctx.runId, d, tally: { readBy: { npm: 0, pypi: 0 }, changed: 0, failed: [], skipped: 0, requests: 0, blocked: new Set() } };
  try {
    await readEach(run, targets, ctx.deadlineMs);
  } catch (e) {
    await recordSteps(run, false).catch(() => {}); // 저장 실패로 멈춰도 거기까지 저장한 것은 실행 기록에 남긴다(원래 오류는 가리지 않음)
    throw e;
  }
  const dead = ECOSYSTEMS.filter((e) => run.tally.readBy[e] === 0 && run.tally.failed.some((f) => f.ecosystem === e));
  await recordSteps(run, dead.length === 0); // 던질 때는 runBatch가 collect_error를 남기고, 자세한 내용은 던진 오류에 담긴다
  if (dead.length) throw deadSource(dead, run.tally.failed);
  return { items: readTotal(run.tally), summary: summarize(run.tally) };
}

async function readEach(run: Run, targets: Ready[], deadlineMs: number): Promise<void> {
  const { tally, d } = run;
  for (const [i, t] of targets.entries()) {
    if (d.now() >= deadlineMs) {
      tally.skipped += targets.length - i; // 오래 안 읽어 본 것부터 읽으므로 못 읽은 쪽이 다음 실행에서 먼저 간다
      return;
    }
    if (tally.blocked.has(t.ecosystem)) {
      tally.skipped++; // 한도 초과가 난 출처는 이번 실행에서 더 부르지 않는다
      continue;
    }
    await readOne(run, t);
  }
}

/** 한 기술: 읽고(수집 오류는 세어 두고 넘어감) 저장한다(저장 실패·코드 버그는 던진다: 숨기지 않음). */
async function readOne(run: Run, t: Ready): Promise<void> {
  const { db, runId, d, tally } = run;
  if (!t.ref) return recordFailure(run, t, "parse", `${t.key}: 주소에 쓸 수 없는 이름`);
  if (tally.requests++ > 0) await d.sleep(REQUEST_GAP_MS); // 요청을 하는 기술 사이에서만 쉰다
  let weekly: number;
  try {
    weekly = await d.fetchWeekly(t.ref);
  } catch (e) {
    if (!(e instanceof CollectError)) throw e;
    return recordFailure(run, t, e.kind, e.message);
  }
  const changed = await saveReading(db, runId, { target: t, sourceId: t.sourceId, weekly, at: new Date(d.now()).toISOString() });
  tally.readBy[t.ecosystem]++;
  if (changed) tally.changed++;
}

async function recordFailure(run: Run, t: Target, kind: ErrorKind, message: string): Promise<void> {
  run.tally.failed.push({ key: t.key, ecosystem: t.ecosystem, kind, message });
  if (kind === "rate_limited") run.tally.blocked.add(t.ecosystem);
  await markFailed(run.db, t.id, kind, new Date(run.d.now()).toISOString());
}

const readTotal = (t: Tally) => t.readBy.npm + t.readBy.pypi;

function deadSource(dead: Ecosystem[], failed: Failure[]): CollectError {
  const mine = failed.filter((f) => dead.includes(f.ecosystem));
  return new CollectError(mine[0].kind, `${dead.map((e) => SOURCE_NAME[e]).join("·")}를 읽지 못했어요(${countKinds(mine)}). 첫 오류: ${mine[0].message}`);
}

/**
 * 수집 상자 줄은 runBatch가 남긴다. 여기서는 그 뒤 단계(normalize·compare)와, 일부만 실패했을 때의 collect_error만 남긴다.
 * compare의 나가는 건수는 0이다: 흐름 화면의 compare→grade 화살표는 compare 줄들의 나가는 건수를 합하는데, 다운로드는 등급 계산으로 넘어가지 않아
 * 다른 수집기(OSV)의 숫자에 섞이면 안 된다. 바뀐 개수는 수집 자료와 요약에 있다.
 */
async function recordSteps({ db, runId, tally: t }: Run, withDetail: boolean): Promise<void> {
  const read = readTotal(t);
  if (read > 0) {
    await recordStep(db, runId, { stepName: "normalize", status: "succeeded", countIn: read, countOut: read, outputSummary: "주간 다운로드를 (출처, 대상, 이전 값, 현재 값, 시각) 모양으로 맞춤" });
    await recordStep(db, runId, { stepName: "compare", status: "succeeded", countIn: read, countOut: 0, outputSummary: `바뀐 값 ${t.changed}개(수집 자료로만 남김, 등급 계산으로 넘어가지 않음), 그대로 ${read - t.changed}개` });
  }
  if (!withDetail || t.failed.length === 0) return;
  const names = t.failed.slice(0, 5).map((f) => f.key).join(", ");
  await recordStep(db, runId, {
    stepName: "collect_error", status: "succeeded", countIn: t.failed.length,
    outputSummary: `fetch_downloads ${t.failed.length}개 수집 오류(${countKinds(t.failed)}): ${names}. 기술마다 마지막 오류는 signals.downloads_error`,
    errorKind: t.failed[0].kind, errorMessage: t.failed[0].message,
  });
}

function summarize(t: Tally): string {
  const parts = [`주간 다운로드 ${readTotal(t)}개 읽음(바뀐 것 ${t.changed}개)`];
  if (t.failed.length) parts.push(`수집 오류 ${t.failed.length}개`);
  if (t.skipped) parts.push(`시간 한도·한도 초과로 ${t.skipped}개는 다음 실행으로`);
  return parts.join(", ");
}
