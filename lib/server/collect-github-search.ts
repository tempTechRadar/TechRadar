// 별 후보 수집기(P-21a, ADR 0030, 데이터설계 8절 "별 후보", 흐름 상자 fetch_stars). 주인: 김영식 A.
// GitHub 주제 태그 4개를 별 1,000 이상으로 검색해 관문 → 의심 거르기 → 태그 안 점수로 상위 100곳을 `stars` 이유로 두껍게 들이고,
// 의심이 붙은 것은 "NEW 후보(얇게, 관리자 확인)"로만 둔다. 같은 저장소 줄이 있으면 합친다. 별 수가 바뀐 것만 수집 자료로 남긴다(불변 3).
// 서버 토큰(GITHUB_TOKEN)이 없거나 모양이 이상하면 호출하지 않고, 검색이 하나라도 실패하면(403·429·422·모양 이상) 아무것도 저장하지 않고 수집 오류로 멈춘다:
// 일부 태그만 읽은 채 점수를 매기면 "후보 없음"과 구별되지 않는다(불변 2). 시간 몫이 다하면 거기까지 읽은 것으로 매기고 요약에 적는다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { repoKey } from "../domain/github-repo.ts";
import { planCandidates, SEARCH_TAGS, type Candidate, type Plan, type SearchPage, type SearchRepo, type SearchTag } from "../domain/star-candidates.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { CollectError, readToken } from "./collect-fetch.ts";
import { fetchSearchPage, PER_PAGE, type SearchQuery } from "./github-search-fetch.ts";
import { countStarRows, readExisting, readSource, saveEntry, STARS_CAP, type Entry, type SaveCtx } from "./github-search-store.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // 검색 한도(토큰 30회/분)보다 넉넉하게 요청 사이 1초
const SEARCH_BUDGET_MS = 20_000; // 묶음 시간 예산(240초) 중 별 후보의 몫(data-sources 0-1)
const SEARCH_WINDOW = 1_000; // GitHub 검색은 한 질의에 앞 1,000건까지만 준다

type Deps = { fetchPage: (q: SearchQuery, token: string) => Promise<SearchPage>; token: () => string | undefined; sleep: (ms: number) => Promise<void>; now: () => number };
type Cursor = SearchQuery & { done: boolean };
type Found = { repos: Map<string, SearchRepo & { tags: SearchTag[] }>; unread: SearchTag[]; requests: number };
type Tally = { created: number; merged: number; refreshed: number; capped: number; same: number; observed: number; suspects: number; unsaved: number };

export function githubSearchCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { fetchPage: fetchSearchPage, token: () => process.env.GITHUB_TOKEN, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_stars", run: (ctx) => collectStars(ctx, d) };
}

async function collectStars(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const source = await readSource(ctx.db);
  if (!source.enabled) return { items: 0, summary: "GitHub 별 후보 검색 출처가 꺼져 있어요(관리자 설정)" };
  const token = readToken(d.token());
  const found = await searchAll(d, token, Math.min(ctx.deadlineMs, d.now() + SEARCH_BUDGET_MS));
  // 시간 몫이 시작 전에 다 지났으면 "후보 0곳"이 아니라 못 읽은 것(불변 2)
  if (found.requests === 0) throw new CollectError("timeout", "시간 몫이 시작 전에 다 지나 GitHub 검색을 한 번도 하지 못했어요");
  const { byRepo: existing, known, registry } = await readExisting(ctx.db);
  const candidates: Candidate[] = [...found.repos.values()].map((r) => ({ ...r, inRegistry: registry.has(repoKey(r)), known: known.has(repoKey(r)) }));
  const plan = planCandidates(candidates, d.now());
  const s: SaveCtx = { db: ctx.db, runId: ctx.runId, sourceId: source.id, at: new Date(d.now()).toISOString(), existing, starRows: countStarRows(existing) };
  const tally: Tally = { created: 0, merged: 0, refreshed: 0, capped: 0, same: 0, observed: 0, suspects: plan.suspects.length, unsaved: 0 };
  try {
    await saveAll(s, plan, tally, () => d.now() >= ctx.deadlineMs);
  } catch (e) {
    await recordSteps(ctx, found, plan, tally).catch(() => {}); // 저장 실패로 멈춰도 거기까지 저장한 것은 실행 기록에 남긴다(원래 오류는 가리지 않음)
    throw e;
  }
  await recordSteps(ctx, found, plan, tally);
  return { items: found.repos.size, summary: summarize(found, plan, tally) };
}

/** 태그마다 별 많은 순으로 쪽을 넘긴다. 태그를 돌아가며 한 쪽씩 읽어, 시간 몫이 다해도 태그마다 별 많은 쪽은 읽혀 있게 한다 */
async function searchAll(d: Deps, token: string, deadlineMs: number): Promise<Found> {
  const found: Found = { repos: new Map(), unread: [], requests: 0 };
  let cursors: Cursor[] = SEARCH_TAGS.map((tag) => ({ tag, upper: null, page: 1, done: false }));
  while (cursors.length > 0) {
    for (const c of cursors) {
      if (d.now() >= deadlineMs) {
        found.unread = cursors.filter((x) => !x.done).map((x) => x.tag);
        return found;
      }
      if (found.requests++ > 0) await d.sleep(REQUEST_GAP_MS);
      const page = await d.fetchPage({ tag: c.tag, upper: c.upper, page: c.page }, token);
      for (const r of page.items) addFound(found, r, c.tag);
      advance(c, page);
    }
    cursors = cursors.filter((c) => !c.done);
  }
  return found;
}

function addFound(found: Found, r: SearchRepo, tag: SearchTag): void {
  const key = repoKey(r);
  const seen = found.repos.get(key);
  if (!seen) found.repos.set(key, { ...r, tags: [tag] });
  else if (!seen.tags.includes(tag)) seen.tags.push(tag);
}

/** 다음 쪽으로. 질의의 앞 1,000건을 다 읽었는데 더 있으면 본 것 중 가장 적은 별 수를 상한으로 새 질의(겹치는 것은 키로 하나가 된다) */
function advance(c: Cursor, page: SearchPage): void {
  const read = c.page * PER_PAGE;
  if (page.items.length === PER_PAGE && read < Math.min(page.total, SEARCH_WINDOW)) {
    c.page++;
    return;
  }
  const lowest = page.items.at(-1)?.stars ?? null;
  const more = page.total > SEARCH_WINDOW && read >= SEARCH_WINDOW && lowest !== null && lowest !== c.upper; // 같은 별 수가 1,000건을 넘으면 더 좁힐 수 없어 멈춘다
  if (more) Object.assign(c, { upper: lowest, page: 1 });
  else c.done = true;
}

/**
 * 점수 높은 순으로 저장해 누적 상한이 낮은 쪽부터 막히게 한다. 의심 붙은 NEW 후보는 얇게, 나머지는 전에 표시한 줄만 맞춘다.
 * 묶음 시간이 다하면 멈춘다: 멱등이라 다음 실행이 남은 것을 이어 간다.
 */
async function saveAll(s: SaveCtx, plan: Plan, t: Tally, overTime: () => boolean): Promise<void> {
  const entries: Entry[] = [
    ...plan.top.map((c): Entry => ({ c, key: c.key, score: c.score, flags: [], mode: "top" })),
    ...plan.suspects.map((c): Entry => ({ c, key: c.key, score: null, flags: c.flags, mode: "suspect" })),
    ...plan.rest.map((c): Entry => ({ c, key: c.key, score: c.score, flags: [], mode: "refresh" })),
  ];
  for (const [i, e] of entries.entries()) {
    if (overTime()) {
      t.unsaved = entries.length - i;
      return;
    }
    const saved = await saveEntry(s, e);
    t[saved.outcome]++;
    if (saved.observed) t.observed++;
  }
}

/** 수집 상자 줄은 runBatch가 남긴다. 여기서는 그 뒤 normalize·compare만(compare의 나가는 건수는 0: 등급 계산으로 넘어가지 않는다) */
async function recordSteps(ctx: CollectorContext, found: Found, plan: Plan, t: Tally): Promise<void> {
  const n = found.repos.size;
  if (n === 0) return;
  await recordStep(ctx.db, ctx.runId, {
    stepName: "normalize", status: "succeeded", countIn: n, countOut: plan.top.length + plan.suspects.length,
    outputSummary: `관문에서 ${plan.gated}곳 뺌(보관·포크·12개월), 의심 ${plan.suspects.length}곳은 NEW 후보로, 점수 상위 ${plan.top.length}곳`,
  });
  await recordStep(ctx.db, ctx.runId, {
    stepName: "compare", status: "succeeded", countIn: plan.top.length + plan.suspects.length, countOut: 0,
    outputSummary: `별 수가 바뀐 것 ${t.observed}곳(수집 자료로만 남김, 등급 계산으로 넘어가지 않음), 새 줄 ${t.created}·기존 줄 합침 ${t.merged}·지난 표시 맞춤 ${t.refreshed}·그대로 ${t.same}`,
  });
}

function summarize(found: Found, plan: Plan, t: Tally): string {
  const parts = [`별 후보 ${found.repos.size}곳 읽음(검색 ${found.requests}번), 두껍게 상위 ${plan.top.length}곳: 새 줄 ${t.created}·기존 줄 합침 ${t.merged}`];
  if (t.suspects) parts.push(`의심 표시 ${t.suspects}곳은 NEW 후보(얇게)`);
  if (t.capped) parts.push(`상한 ${STARS_CAP}에 닿아 ${t.capped}곳은 안 올림`);
  if (found.unread.length) parts.push(`시간 몫으로 다 못 읽은 태그: ${found.unread.join(", ")}`);
  if (t.unsaved) parts.push(`시간이 모자라 ${t.unsaved}곳은 다 저장 못 함(다음 실행이 이어 감)`);
  return parts.join(", ");
}
