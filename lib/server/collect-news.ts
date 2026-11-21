// 바깥 소식 수집기(P-12f ⑥, 흐름 상자 fetch_news). 약관을 확인한 공식 피드(lib/domain/news-feeds.ts)의 제목 · 링크 · 날짜 · 짧은 요약만 읽어 news_items에 넣는다.
// 약관 조건(docs/data-sources.md): 하루 1번 · 요청 사이 1초 · 원문 링크를 같이 보임 · AI 학습에 쓰지 않음(이 수집기는 AI를 부르지 않는다).
// 피드 하나가 실패하면 그 피드만 수집 오류로 세고 나머지는 계속한다(불변 2). 전부 실패하면 던져서 runBatch가 수집 오류(재시도 · 3번 연속 강조)로 기록한다.
// 같은 소식은 url로 한 줄(불변 3). 실행 몫은 15초: 정기 실행 240초를 다른 수집기와 나눠 쓴다(마지막에 둠).
// 상대 경로 import · 파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { NEWS_FEEDS, releasesUrl, type NewsFeed } from "../domain/news-feeds.ts";
import { parseFeed, parseReleases, type NewsEntry } from "../domain/news-parse.ts";
import type { Collector, CollectorContext } from "../schedule/run-batch.ts";
import { CollectError, fetchText, TOKEN_SHAPE, type ErrorKind } from "./collect-fetch.ts";
import { countKinds } from "./collect-util.ts";
import { markSynced, readNewsSource, saveNewsItems, type NewsRow } from "./news-store.ts";
import { recordStep } from "./run-log.ts";

const REQUEST_GAP_MS = 1_000; // 약관 조건: 요청 사이 1초 이상
const NEWS_BUDGET_MS = 15_000; // 한 실행의 몫
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // "하루 1번": 정기(24시간 간격)는 통과하고, 같은 날 "지금 한 번 실행"은 건너뛴다
const USER_AGENT = "TechRadar-student-project/1.0 (news titles and links only)";
const FEED_ACCEPT = "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5";

type Deps = { feeds: NewsFeed[]; fetchText: typeof fetchText; token: () => string | undefined; sleep: (ms: number) => Promise<void>; now: () => number };
type Failure = { key: string; kind: ErrorKind; message: string };
type Tally = { feedsRead: number; entries: number; added: number; failed: Failure[]; skipped: number };

export function newsCollector(deps: Partial<Deps> = {}): Collector {
  const d: Deps = { feeds: NEWS_FEEDS, fetchText, token: () => process.env.GITHUB_TOKEN, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, ...deps };
  return { source: "fetch_news", run: (ctx) => collectNews(ctx, d) };
}

/** 피드 하나를 읽어 항목으로 만든다. 못 읽으면 CollectError(없는 주소 · 모양이 바뀜 포함 — "소식 없음"으로 읽지 않는다) */
async function readEntries(feed: NewsFeed, d: Deps): Promise<NewsEntry[]> {
  const parse = (text: string) => {
    try {
      return feed.kind === "feed" ? parseFeed(text, d.now()) : parseReleases(text, d.now());
    } catch (e) {
      throw new CollectError("parse", `${feed.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  if (feed.kind === "feed") {
    const text = await d.fetchText(feed.url, { headers: { accept: FEED_ACCEPT, "user-agent": USER_AGENT } });
    if (text === null) throw new CollectError("http_status", `${feed.key}: 피드를 찾지 못함(404)`, 404);
    return parse(text);
  }
  const url = releasesUrl(feed.repo);
  if (!url) throw new CollectError("parse", `${feed.key}: 저장소 이름이 이상해 부르지 않음`);
  const token = d.token()?.trim();
  const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": USER_AGENT };
  if (token && TOKEN_SHAPE.test(token)) headers.authorization = `Bearer ${token}`; // 없어도 공개 목록은 읽힌다(하루 1번이라 인증 없는 한도로 충분)
  const text = await d.fetchText(url, { headers });
  if (text === null) throw new CollectError("http_status", `${feed.key}: 릴리스 목록을 찾지 못함(404)`, 404);
  return parse(text);
}

const rowOf = (feed: NewsFeed, e: NewsEntry): NewsRow => ({ source_key: feed.key, title: e.title, url: e.url, summary: e.summary, published_at: e.publishedAt, tools: feed.tools, official: true });

async function collectNews(ctx: CollectorContext, d: Deps): Promise<{ items: number; summary: string }> {
  const source = await readNewsSource(ctx.db);
  if (!source.enabled) return { items: 0, summary: "소식 출처가 꺼져 있어요(관리자 설정)" };
  const last = source.lastSyncedAt ? Date.parse(source.lastSyncedAt) : NaN;
  if (Number.isFinite(last) && d.now() - last < MIN_INTERVAL_MS) {
    return { items: 0, summary: `소식은 하루 한 번만 읽어요(마지막 읽기 ${Math.floor((d.now() - last) / 3_600_000)}시간 전, 약관 조건)` };
  }
  const tally: Tally = { feedsRead: 0, entries: 0, added: 0, failed: [], skipped: 0 };
  const deadline = Math.min(ctx.deadlineMs, d.now() + NEWS_BUDGET_MS);
  for (const [i, feed] of d.feeds.entries()) {
    if (d.now() >= deadline) {
      tally.skipped = d.feeds.length - i; // 못 읽은 피드는 다음 실행(내일)으로
      break;
    }
    if (i > 0) await d.sleep(REQUEST_GAP_MS);
    await readOne(ctx.db, feed, d, tally);
  }
  if (tally.feedsRead === 0 && tally.failed.length > 0) throw deadSource(tally.failed);
  if (tally.feedsRead > 0) await markSynced(ctx.db, source.id, new Date(d.now()).toISOString());
  await recordFailures(ctx, tally);
  return { items: tally.added, summary: summarize(tally) };
}

/** 한 피드: 읽고(수집 오류는 세고 넘어감) 저장한다(저장 실패 · 코드 버그는 던진다: 숨기지 않음) */
async function readOne(db: SupabaseClient, feed: NewsFeed, d: Deps, tally: Tally): Promise<void> {
  let entries: NewsEntry[];
  try {
    entries = await readEntries(feed, d);
  } catch (e) {
    if (!(e instanceof CollectError)) throw e;
    tally.failed.push({ key: feed.key, kind: e.kind, message: e.message });
    return;
  }
  tally.added += await saveNewsItems(db, entries.map((e) => rowOf(feed, e)));
  tally.entries += entries.length;
  tally.feedsRead++;
}

function deadSource(failed: Failure[]): CollectError {
  return new CollectError(failed[0].kind, `소식 피드를 하나도 읽지 못했어요(${countKinds(failed)}). 첫 오류: ${failed[0].message}`);
}

/** 일부만 실패했을 때 collect_error 단계를 남긴다(전부 실패하면 runBatch가 남긴다) */
async function recordFailures({ db, runId }: CollectorContext, t: Tally): Promise<void> {
  if (t.failed.length === 0) return;
  await recordStep(db, runId, {
    stepName: "collect_error", status: "succeeded", countIn: t.failed.length,
    outputSummary: `fetch_news ${t.failed.length}개 피드 수집 오류(${countKinds(t.failed)}): ${t.failed.map((f) => f.key).join(", ")}. 못 읽은 피드의 소식은 "없음"이 아니라 읽지 못한 것이다`,
    errorKind: t.failed[0].kind, errorMessage: t.failed[0].message,
  });
}

function summarize(t: Tally): string {
  const parts = [`피드 ${t.feedsRead}곳에서 소식 ${t.entries}건을 읽고 새로 ${t.added}건 저장`];
  if (t.failed.length) parts.push(`수집 오류 ${t.failed.length}곳`);
  if (t.skipped) parts.push(`시간 몫이 끝나 ${t.skipped}곳은 다음 실행으로`);
  return parts.join(", ");
}
