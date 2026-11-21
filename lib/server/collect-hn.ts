// Hacker News 화제 신호 수집기(P-21b, ADR 0030 2번, 데이터설계 8절 관문 1, 흐름 상자 fetch_popularity). 주인: 김영식 A.
// 키워드마다 최근 7일 글을 읽어, GitHub 저장소·npm 패키지로 이어지는 글만 쓴다. 알려진 기술에는 signals.hn만 붙이고(점수·두껍게에는 아직 안 씀),
// 모르는 저장소는 이름에 mcp·skill이 있을 때만 얇게 만든다(한 실행 최대 30개). 모르는 npm 패키지는 만들지 않고 센다.
// 일부 키워드만 실패하면 읽은 것은 쓰고 collect_error 줄에 센다. 모두 실패하면 던져서 runBatch가 수집 오류로 기록한다(불변 2). 저장 규칙은 hn-store.ts.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { bestPerTarget, HN_KEYWORDS, matchesKeyword, parseStoryLink, signalOf, targetKey, typeGuess, type HnHit, type StoryTarget } from "../domain/hn.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { CollectError, type ErrorKind } from "./collect-fetch.ts";
import { countKinds } from "./collect-util.ts";
import { fetchHnHits } from "./hn-fetch.ts";
import { createThin, readCatalog, readSource, saveSignal, type Catalog, type Saved } from "./hn-store.ts";
import { logFailure } from "./log-failure.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // SPEC-8: 요청 사이 1초 이상
const HN_BUDGET_MS = 20_000; // 묶음 시간 예산(240초) 중 HN의 몫: 4번 읽기 + 저장
export const MAX_NEW_PER_RUN = 30; // 한 실행에 새로 만드는 얇은 줄(팀 추정, ADR 0030)

type Deps = { fetchHits: (keyword: string, nowMs: number) => Promise<{ hits: HnHit[]; invalid: number }>; sleep: (ms: number) => Promise<void>; now: () => number };
type Failure = { key: string; kind: ErrorKind; message: string };
type Picked = { target: StoryTarget; hit: HnHit };
type Tally = { stories: number; dropped: number; repos: number; packages: number; changed: number; created: number; overCap: number; unregistered: number; nameMismatch: number; taken: number; notSaved: number; failed: Failure[]; skipped: number; readKeywords: number };
type Run = { db: SupabaseClient; saved: Saved; t: Tally; done: Set<string>; now: () => number; deadlineMs: number };

export function hnCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { fetchHits: fetchHnHits, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_popularity", run: (ctx) => collectHn(ctx, d) };
}

async function collectHn(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const source = await readSource(ctx.db);
  if (!source.enabled) return { items: 0, summary: "Hacker News 출처가 꺼져 있어요(관리자 설정)" };
  const t: Tally = { stories: 0, dropped: 0, repos: 0, packages: 0, changed: 0, created: 0, overCap: 0, unregistered: 0, nameMismatch: 0, taken: 0, notSaved: 0, failed: [], skipped: 0, readKeywords: 0 };
  const deadlineMs = Math.min(ctx.deadlineMs, d.now() + HN_BUDGET_MS);
  const hits = await readKeywords(d, t, deadlineMs);
  if (t.readKeywords === 0) throw nothingRead(t); // 하나도 못 읽었으면 "글 0개"가 아니라 수집 오류(불변 2)
  const picked = pick(hits, t);
  const run: Run = { db: ctx.db, saved: { sourceId: source.id, runId: ctx.runId, at: new Date(d.now()).toISOString() }, t, done: new Set(), now: d.now, deadlineMs };
  try {
    if (picked.length) await saveAll(run, picked);
  } catch (e) {
    await recordSteps(run, false).catch(logFailure("HN 저장 실패 뒤 단계 기록도 실패")); // 저장 실패로 멈춰도 거기까지 저장한 것은 실행 기록에 남긴다(원래 오류는 가리지 않음)
    throw e;
  }
  await recordSteps(run, true);
  return { items: t.stories, summary: summarize(t) };
}

/** 키워드마다 1번. 실패한 키워드는 세고 넘어간다. 한도 초과면 나머지는 부르지 않는다. */
async function readKeywords(d: Deps, t: Tally, deadlineMs: number): Promise<HnHit[]> {
  const hits: HnHit[] = [];
  for (const [i, keyword] of HN_KEYWORDS.entries()) {
    if (d.now() >= deadlineMs || t.failed.some((f) => f.kind === "rate_limited")) {
      t.skipped += HN_KEYWORDS.length - i;
      break;
    }
    if (i > 0) await d.sleep(REQUEST_GAP_MS);
    try {
      const r = await d.fetchHits(keyword, d.now());
      hits.push(...r.hits);
      t.dropped += r.invalid;
      t.readKeywords++;
    } catch (e) {
      if (!(e instanceof CollectError)) throw e;
      t.failed.push({ key: keyword, kind: e.kind, message: e.message });
    }
  }
  return hits;
}

function nothingRead(t: Tally): CollectError {
  if (!t.failed.length) return new CollectError("timeout", "시간 한도 안에 Hacker News를 하나도 읽지 못했어요");
  return new CollectError(t.failed[0].kind, `Hacker News를 읽지 못했어요(${countKinds(t.failed)}). 첫 오류: ${t.failed[0].message}`);
}

/** 같은 글이 여러 키워드에 걸리면 한 번만. 제목에 키워드가 낱말로 있고 저장소·패키지로 이어지는 글만 남긴다(나머지는 버린 글로 셈). */
function pick(hits: HnHit[], t: Tally): Picked[] {
  const unique = [...new Map(hits.map((h) => [h.objectID, h])).values()];
  t.stories = unique.length;
  const linked = unique.flatMap((hit): Picked[] => {
    const target = matchesKeyword(hit.title) ? parseStoryLink(hit.url) : null;
    if (!target) t.dropped++;
    return target ? [{ target, hit }] : [];
  });
  const best = bestPerTarget(linked);
  t.repos = best.filter((p) => p.target.kind === "github").length;
  t.packages = best.length - t.repos;
  return best;
}

/**
 * 점수가 높은 글부터 저장한다. 한 기술이 저장소 키와 패키지 키로 둘 다 걸리면(같은 줄이 repo_url과 npm 키를 가짐) 높은 글 하나만 쓴다:
 * 둘을 차례로 쓰면 실행마다 두 글이 번갈아 쓰여 수집 자료가 늘어난다(불변 3).
 */
async function saveAll(run: Run, picked: Picked[]): Promise<void> {
  const catalog: Catalog = await readCatalog(run.db);
  const order = [...picked].sort((x, y) => y.hit.points - x.hit.points);
  for (const [i, p] of order.entries()) {
    if (run.now() >= run.deadlineMs) {
      run.t.notSaved += order.length - i; // 멱등이라 다음 실행이 이어 간다(점수 높은 글부터 저장해 둠)
      return;
    }
    const known = catalog.get(targetKey(p.target)) ?? [];
    for (const id of known) await saveOnce(run, id, p);
    if (known.length) continue;
    if (p.target.kind === "npm") run.t.unregistered++;
    else await maybeCreate(run, p.target, p);
  }
}

async function saveOnce(run: Run, id: string, p: Picked): Promise<void> {
  if (run.done.has(id)) return;
  run.done.add(id);
  if (await saveSignal(run.db, { saved: run.saved, techId: id, signal: signalOf(p.hit, run.saved.at) })) run.t.changed++;
}

async function maybeCreate(run: Run, target: Extract<StoryTarget, { kind: "github" }>, p: Picked): Promise<void> {
  const { t } = run;
  const type = typeGuess(target.repo);
  if (!type) return void t.nameMismatch++;
  if (t.created >= MAX_NEW_PER_RUN) return void t.overCap++;
  const id = await createThin(run.db, target, type);
  if (!id) return void t.taken++; // 같은 키가 이미 있음(가짜 줄이거나 그 사이 다른 수집기가 만듦): 건드리지 않는다
  t.created++;
  await saveOnce(run, id, p);
}

/** 수집 상자 줄은 runBatch가 남긴다. 여기서는 normalize·compare와, 일부 키워드만 실패했을 때의 collect_error만. compare의 나가는 건수는 0(등급 계산으로 넘어가지 않음, collect-downloads.ts와 같은 이유). */
async function recordSteps({ db, saved: { runId }, t }: Run, withDetail: boolean): Promise<void> {
  const linked = t.repos + t.packages;
  if (t.stories > 0) {
    await recordStep(db, runId, { stepName: "normalize", status: "succeeded", countIn: t.stories, countOut: linked, outputSummary: `HN 글 ${t.stories}개 중 저장소·패키지로 이어지는 ${linked}개(버린 글 ${t.dropped}개)` });
    await recordStep(db, runId, { stepName: "compare", status: "succeeded", countIn: linked, countOut: 0, outputSummary: `화제 신호가 바뀐 기술 ${t.changed}개, 새 얇은 기술 ${t.created}개(수집 자료로만 남김, 등급 계산으로 넘어가지 않음)` });
  }
  if (!withDetail || t.failed.length === 0) return;
  await recordStep(db, runId, {
    stepName: "collect_error", status: "succeeded", countIn: t.failed.length,
    outputSummary: `fetch_popularity(HN) 키워드 ${t.failed.length}개 수집 오류(${countKinds(t.failed)}): ${t.failed.map((f) => f.key).join(", ")}`,
    errorKind: t.failed[0].kind, errorMessage: t.failed[0].message,
  });
}

function summarize(t: Tally): string {
  const parts = [`HN 글 ${t.stories}개 읽음 → 저장소 ${t.repos}·패키지 ${t.packages}개(버린 글 ${t.dropped}개), 화제 신호 바뀜 ${t.changed}개, 새 얇은 기술 ${t.created}개`];
  if (t.overCap) parts.push(`새 줄 상한 ${MAX_NEW_PER_RUN}개에 닿아 ${t.overCap}개는 다음 실행으로`);
  if (t.unregistered) parts.push(`미등록 패키지 ${t.unregistered}개`);
  if (t.nameMismatch) parts.push(`이름에 mcp·skill이 없어 안 만든 저장소 ${t.nameMismatch}개`);
  if (t.notSaved) parts.push(`시간 한도로 대상 ${t.notSaved}개는 다음 실행으로`);
  if (t.taken) parts.push(`같은 키가 이미 있어 건너뛴 저장소 ${t.taken}개`);
  if (t.failed.length) parts.push(`수집 오류 키워드 ${t.failed.length}개`);
  if (t.skipped) parts.push(`시간 한도·한도 초과로 키워드 ${t.skipped}개는 다음 실행으로`);
  return parts.join(", ");
}
