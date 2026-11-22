import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsFeed } from "../domain/news-feeds.ts";
import { CollectError } from "./collect-fetch.ts";
import { newsCollector } from "./collect-news.ts";

type Row = Record<string, any>;
const NOW = Date.parse("2026-11-22T00:00:00Z");
const TOKEN = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

// 메모리 표: sources 한 줄(news), news_items(url 유일 · 중복은 건너뜀), run_steps 모음. failSave: 소식 저장이 실패한 것처럼
function fakeDb(opt: { source?: Row | null; failSave?: boolean } = {}) {
  const state = { source: opt.source === undefined ? ({ id: "src-1", enabled: true, last_synced_at: null } as Row) : opt.source, items: [] as Row[], steps: [] as Row[] };
  const db = {
    from(table: string) {
      if (table === "sources") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: state.source, error: null }) }) }),
          update: (patch: Row) => ({ eq: () => { if (state.source) Object.assign(state.source, patch); return Promise.resolve({ error: null }); } }),
        };
      }
      if (table === "news_items") {
        return {
          upsert: (rows: Row[], o: { onConflict: string; ignoreDuplicates: boolean }) => {
            assert.deepEqual(o, { onConflict: "url", ignoreDuplicates: true }, "같은 주소는 건너뛴다(불변 3)");
            if (opt.failSave) return { select: () => Promise.resolve({ data: null, error: { message: "DB 오류" } }) };
            const fresh = rows.filter((r) => !state.items.some((i) => i.url === r.url));
            state.items.push(...fresh);
            return { select: () => Promise.resolve({ data: fresh.map((_, i) => ({ id: `n${state.items.length}-${i}` })), error: null }) };
          },
        };
      }
      if (table === "run_steps") return { insert: (row: Row) => (state.steps.push(row), Promise.resolve({ error: null })) };
      throw new Error(`예상 못 한 표 ${table}`);
    },
  } as unknown as SupabaseClient;
  return { db, state };
}

const FEEDS: NewsFeed[] = [
  { key: "blog_a", label: "A", kind: "feed", url: "https://a.example/feed", tools: ["github"] },
  { key: "blog_b", label: "B", kind: "feed", url: "https://b.example/atom", tools: ["gemini"] },
  { key: "rel_c", label: "C", kind: "github_releases", repo: "acme/tool", tools: ["tool"] },
];
const RSS = `<rss><channel><item><title>A 소식</title><link>https://a.example/1</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate><description>요약 A</description></item></channel></rss>`;
const ATOM = `<feed><entry><title>B 소식</title><link href="https://b.example/1"/><published>2026-11-19T00:00:00Z</published></entry></feed>`;
const RELEASES = JSON.stringify([{ name: "v1.2.3", tag_name: "v1.2.3", html_url: "https://github.com/acme/tool/releases/tag/v1.2.3", published_at: "2026-11-21T00:00:00Z", body: "고침" }]);
const REL_URL = "https://api.github.com/repos/acme/tool/releases?per_page=10";
const BODIES: Record<string, string | null | Error> = { "https://a.example/feed": RSS, "https://b.example/atom": ATOM, [REL_URL]: RELEASES };

function harness(bodies: Record<string, string | null | Error> = BODIES, over: { feeds?: NewsFeed[]; token?: string; step?: number } = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  let t = NOW;
  const collector = newsCollector({
    feeds: over.feeds ?? FEEDS,
    token: () => over.token,
    now: () => t,
    sleep: async (ms) => { sleeps.push(ms); t += ms; },
    fetchText: async (url, init) => {
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      t += over.step ?? 0;
      const body = bodies[url];
      if (body instanceof Error) throw body;
      return body ?? null;
    },
  });
  return { collector, calls, sleeps };
}
const ctx = (db: SupabaseClient, deadlineMs = NOW + 240_000) => ({ db, runId: "run-1", deadlineMs });

test("소식 수집: 피드 셋을 읽어 제목 · 링크 · 날짜 · 요약 · 도구 · 출처 키로 저장하고, 요청 사이 1초를 쉬고, 읽은 시각을 남긴다", async () => {
  const { db, state } = fakeDb();
  const h = harness();
  const out = await h.collector.run(ctx(db));
  assert.equal(out.items, 3);
  assert.equal(out.summary, "피드 3곳에서 소식 3건을 읽고 새로 3건 저장");
  assert.deepEqual(state.items.map((r) => [r.source_key, r.title, r.url, r.official]), [
    ["blog_a", "A 소식", "https://a.example/1", true],
    ["blog_b", "B 소식", "https://b.example/1", true],
    ["rel_c", "v1.2.3", "https://github.com/acme/tool/releases/tag/v1.2.3", true],
  ]);
  assert.deepEqual(state.items[0], { source_key: "blog_a", title: "A 소식", url: "https://a.example/1", summary: "요약 A", published_at: "2026-11-20T09:00:00.000Z", tools: ["github"], official: true });
  assert.deepEqual(h.sleeps, [1000, 1000], "약관 조건: 요청 사이 1초");
  assert.equal(state.source!.last_synced_at, new Date(NOW + 2000).toISOString());
  assert.equal(state.steps.length, 0, "실패가 없으면 수집 오류 단계를 안 남긴다");
});

test("소식 수집: 같은 소식을 다시 읽어도 늘지 않는다(불변 3)", async () => {
  const { db, state } = fakeDb();
  await harness().collector.run(ctx(db));
  state.source!.last_synced_at = null; // 하루가 지났다고 치고 다시
  const again = await harness().collector.run(ctx(db));
  assert.equal(again.items, 0);
  assert.match(again.summary!, /소식 3건을 읽고 새로 0건 저장/);
  assert.equal(state.items.length, 3);
});

test("소식 수집: 하루 한 번만 — 같은 날 다시 실행하면 부르지 않는다(약관 조건), 20시간이 지나면 읽는다", async () => {
  const { db } = fakeDb({ source: { id: "src-1", enabled: true, last_synced_at: new Date(NOW - 3 * 3_600_000).toISOString() } });
  const early = harness();
  const out = await early.collector.run(ctx(db));
  assert.deepEqual([out.items, early.calls.length], [0, 0]);
  assert.match(out.summary!, /하루 한 번만 읽어요\(마지막 읽기 3시간 전/);
  const late = fakeDb({ source: { id: "src-1", enabled: true, last_synced_at: new Date(NOW - 21 * 3_600_000).toISOString() } });
  const h = harness();
  assert.equal((await h.collector.run(ctx(late.db))).items, 3);
});

test("소식 수집: 관리자가 끈 출처는 부르지 않고, 출처 줄이 없으면(마이그레이션 전) 던진다", async () => {
  const off = fakeDb({ source: { id: "src-1", enabled: false, last_synced_at: null } });
  const h = harness();
  assert.deepEqual([(await h.collector.run(ctx(off.db))).summary, h.calls.length], ["소식 출처가 꺼져 있어요(관리자 설정)", 0]);
  await assert.rejects(() => harness().collector.run(ctx(fakeDb({ source: null }).db)), /출처 news를 찾지 못함/);
});

test("소식 수집: 피드 하나가 실패하면 그 피드만 수집 오류로 세고 나머지는 저장한다(불변 2) — 못 읽은 것을 '없음'으로 쓰지 않는다", async () => {
  const { db, state } = fakeDb();
  const h = harness({ ...BODIES, "https://a.example/feed": null, [REL_URL]: "[ 깨진 응답" });
  const out = await h.collector.run(ctx(db));
  assert.equal(out.items, 1);
  assert.match(out.summary!, /피드 1곳에서 소식 1건을 읽고 새로 1건 저장, 수집 오류 2곳/);
  assert.deepEqual(state.items.map((r) => r.source_key), ["blog_b"]);
  const step = state.steps.find((s) => s.step_name === "collect_error")!;
  assert.deepEqual([step.status, step.count_in, step.error_kind], ["succeeded", 2, "http_status"]);
  assert.match(String(step.output_summary), /blog_a, rel_c/);
  assert.ok(state.source!.last_synced_at, "하나라도 읽었으면 읽은 시각을 남긴다");
});

test("소식 수집: 피드를 하나도 못 읽으면 던져서 수집 오류로 남기고, 읽은 시각은 올리지 않는다(내일이 아니라 다음 실행에서 다시)", async () => {
  const { db, state } = fakeDb();
  const h = harness({ ...BODIES, "https://a.example/feed": new CollectError("rate_limited", "429", 429), "https://b.example/atom": new CollectError("timeout", "느림"), [REL_URL]: null });
  await assert.rejects(() => h.collector.run(ctx(db)), (e: unknown) => e instanceof CollectError && e.kind === "rate_limited" && /하나도 읽지 못했어요\(rate_limited 1, timeout 1, http_status 1\)/.test(e.message));
  assert.equal(state.source!.last_synced_at, null);
  assert.equal(state.items.length, 0);
});

test("소식 수집: 시간 몫(15초)이 끝나면 남은 피드는 다음 실행으로 넘기고 건수를 알린다", async () => {
  const { db, state } = fakeDb();
  const h = harness(BODIES, { step: 9_000 }); // 요청 하나에 9초 → 둘째 요청 뒤에 몫이 끝남
  const out = await h.collector.run(ctx(db));
  assert.equal(h.calls.length, 2);
  assert.match(out.summary!, /시간 몫이 끝나 1곳은 다음 실행으로/);
  assert.equal(state.items.length, 2);
});

test("소식 수집: 저장이 실패하면 숨기지 않고 던지고, 읽은 시각도 남기지 않는다", async () => {
  const { db, state } = fakeDb({ failSave: true });
  await assert.rejects(() => harness().collector.run(ctx(db)), /소식을 저장하지 못함: DB 오류/);
  assert.equal(state.source!.last_synced_at, null);
});

test("소식 수집: GitHub 토큰은 모양이 맞을 때만 릴리스 요청에 싣고, 피드 요청에는 싣지 않으며 값은 어디에도 남지 않는다", async () => {
  const withToken = harness(BODIES, { token: TOKEN });
  await withToken.collector.run(ctx(fakeDb().db));
  const rel = withToken.calls.find((c) => c.url === REL_URL)!;
  assert.equal(rel.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(withToken.calls.filter((c) => c.headers.authorization).length, 1);
  assert.ok(withToken.calls.every((c) => c.headers["user-agent"]?.startsWith("TechRadar-student-project")));
  const bad = harness(BODIES, { token: "공백 이 섞인\n값" });
  const { db, state } = fakeDb();
  await bad.collector.run(ctx(db));
  assert.equal(bad.calls.find((c) => c.url === REL_URL)!.headers.authorization, undefined);
  assert.ok(!JSON.stringify([state.items, state.steps]).includes(TOKEN));
});

test("소식 수집: 코드 버그(수집 오류가 아닌 예외)는 피드 오류로 삼키지 않고 던진다", async () => {
  const h = harness({ ...BODIES, "https://a.example/feed": new TypeError("버그") });
  await assert.rejects(() => h.collector.run(ctx(fakeDb().db)), /버그/);
});
