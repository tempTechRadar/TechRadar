import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_HN_POINTS, MIN_STAR_GAIN, starGainOf, trendingTechs, type HnSeen, type StarObservation, type TrendInput } from "./trending.ts";

const NOW = Date.parse("2026-11-22T00:00:00Z");
const ago = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
const hn = (points: number, over: Partial<HnSeen> = {}): HnSeen => ({ points, comments: 12, title: "Show HN: 새 MCP 서버", url: "https://news.ycombinator.com/item?id=1", seenAt: ago(1), ...over });
const tech = (id: string, over: Partial<TrendInput> = {}): TrendInput => ({ id, name: `기술-${id}`, grade: "pass", stars: 1000, starsGain: 0, hn: null, flagged: false, ...over });
const obs = (daysAgo: number, prev: number | null, curr: number): StarObservation => ({ observedAt: ago(daysAgo), prev, curr });

test("별 급등: 최근 7일 안에서 늘어난 수만 더한다(처음 읽은 줄 · 줄어든 것 · 7일 밖 · 읽을 수 없는 시각 · 미래는 뺀다)", () => {
  assert.equal(starGainOf([obs(1, 100, 130), obs(3, 130, 150), obs(5, 150, 140)], NOW), 50, "줄어든 -10은 0으로");
  assert.equal(starGainOf([obs(1, null, 5000)], NOW), 0, "처음 읽음은 늘었다고 보지 않는다(기준값이 없음)");
  assert.equal(starGainOf([obs(8, 100, 900)], NOW), 0, "7일 밖");
  assert.equal(starGainOf([{ observedAt: "어제쯤", prev: 1, curr: 99 }, obs(-5, 1, 99)], NOW), 0, "읽을 수 없는 시각 · 미래");
  assert.equal(starGainOf([{ observedAt: ago(1), prev: NaN, curr: 9 }], NOW), 0);
  assert.equal(starGainOf([], NOW), 0);
});

test("뜨는 기술: 별 급등(7일 30개 이상) 또는 HN 화제(점수 30 이상, 7일 안)가 있어야 하고, 이유를 함께 돌려준다", () => {
  const r = trendingTechs([
    tech("a", { starsGain: MIN_STAR_GAIN, stars: 1500 }),
    tech("b", { hn: hn(MIN_HN_POINTS) }),
    tech("c", { starsGain: MIN_STAR_GAIN - 1, hn: hn(MIN_HN_POINTS - 1) }),
    tech("d"),
  ], NOW);
  assert.deepEqual(r.map((x) => x.id), ["a", "b"].sort((x, y) => (r.find((q) => q.id === x)!.score - r.find((q) => q.id === y)!.score) * -1 || (x < y ? -1 : 1)));
  assert.deepEqual(r.find((x) => x.id === "a")!.reasons, [{ kind: "stars", gain: 30, stars: 1500 }]);
  assert.deepEqual(r.find((x) => x.id === "b")!.reasons, [{ kind: "hn", points: 30, comments: 12, title: "Show HN: 새 MCP 서버", url: "https://news.ycombinator.com/item?id=1" }]);
});

test("뜨는 기술: 점수 = 별 급등 + HN(각각 상한 500으로 자름), 둘 다 있으면 위로, 같은 점수는 이름 순", () => {
  const r = trendingTechs([
    tech("only-stars", { starsGain: 100 }),
    tech("both", { starsGain: 100, hn: hn(100) }),
    tech("huge", { starsGain: 100000 }),
    tech("tie-b", { starsGain: 50 }),
    tech("tie-a", { starsGain: 50 }),
  ], NOW);
  assert.deepEqual(r.map((x) => [x.id, x.score]), [["huge", 100], ["both", 40], ["only-stars", 20], ["tie-a", 10], ["tie-b", 10]]);
  assert.equal(r[0].reasons.length, 1);
  assert.equal(r[1].reasons.length, 2);
});

test("뜨는 기술: 의심 표시 · 위험 등급은 뺀다(위험한 것을 요즘 뜬다고 권하지 않음), 주의 등급은 이유와 함께 남는다", () => {
  const r = trendingTechs([
    tech("flagged", { starsGain: 500, flagged: true }),
    tech("danger", { starsGain: 500, grade: "danger" }),
    tech("caution", { starsGain: 500, grade: "caution" }),
    tech("unknown", { starsGain: 500, grade: "unknown" }),
  ], NOW);
  assert.deepEqual(r.map((x) => x.id).sort(), ["caution", "unknown"]);
});

test("뜨는 기술: HN 글은 https 주소 · 7일 안의 읽은 시각 · 유한한 점수일 때만(그 밖은 신호가 없는 것으로)", () => {
  const r = trendingTechs([
    tech("old", { hn: hn(500, { seenAt: ago(8) }) }),
    tech("future", { hn: hn(500, { seenAt: ago(-3) }) }),
    tech("bad-date", { hn: hn(500, { seenAt: "언젠가" }) }),
    tech("http", { hn: hn(500, { url: "http://news.ycombinator.com/item?id=1" }) }),
    tech("nan", { hn: hn(Number.NaN) }),
    tech("ok", { hn: hn(500, { seenAt: ago(6.9) }) }),
  ], NOW);
  assert.deepEqual(r.map((x) => x.id), ["ok"]);
});

test("뜨는 기술: 개수 제한 · 0이면 빈 목록 · 같은 입력은 늘 같은 순서", () => {
  const items = Array.from({ length: 20 }, (_, i) => tech(`t${String(i).padStart(2, "0")}`, { starsGain: 100 + i }));
  assert.equal(trendingTechs(items, NOW).length, 12);
  assert.equal(trendingTechs(items, NOW, 3).length, 3);
  assert.deepEqual(trendingTechs(items, NOW, 0), []);
  assert.deepEqual(trendingTechs([...items].reverse(), NOW), trendingTechs(items, NOW));
  assert.equal(trendingTechs(items, NOW)[0].id, "t19", "가장 많이 늘어난 것이 맨 위");
});
