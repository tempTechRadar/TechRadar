import { test } from "node:test";
import assert from "node:assert/strict";
import type { Trending } from "../domain/trending.ts";
import { newsBoard } from "./news.ts";
import { externalNews, officialNews, trendingNews, vulnNews, type VulnChangeIn } from "./news-events.ts";

const NOW = Date.parse("2026-11-22T00:00:00Z");

test("바깥 소식: 줄을 항목으로(출처 이름은 피드 이름, 도구가 없으면 빈 목록)", () => {
  const [a, b] = externalNews([
    { id: "1", source_key: "github_changelog", title: "새 기능", url: "https://github.blog/x", summary: "요약", published_at: "2026-11-20T00:00:00Z", tools: ["github"], official: true },
    { id: "2", source_key: "알수없음", title: "t", url: "https://x.dev/y", summary: null, published_at: "2026-11-20T00:00:00Z", tools: null, official: true },
  ], { github_changelog: "GitHub 변경 기록" });
  assert.deepEqual([a.id, a.source, a.kind, a.tools, a.summary], ["news:1", "GitHub 변경 기록", "external", ["github"], "요약"]);
  assert.deepEqual([b.source, b.tools], ["알수없음", []]);
});

const change = (over: Partial<VulnChangeIn> = {}): VulnChangeIn => ({
  id: "c1", kind: "grade_to_danger", detected_at: "2026-11-21T00:00:00Z", technologies: { display_name: "mcp-remote" },
  curr_value: { reason: "심각한 취약점이 있어요", evidence: [{ id: "GHSA-1", url: "http://bad.example/1" }, { id: "GHSA-2", url: "https://osv.dev/vulnerability/GHSA-2" }] }, ...over,
});

test("내 취약점 소식: 첫 https 근거 주소가 출처, 제목에 근거 번호, 쉬운 이유가 요약 — 이름 · 주소가 없으면 빼고 센다", () => {
  const r = vulnNews([
    change(),
    change({ id: "c2", curr_value: { evidence: [{ id: "x", url: "http://only-http.example" }] } }),
    change({ id: "c3", technologies: null }),
    change({ id: "c4", technologies: [{ display_name: "배열로 온 이름" }] }),
    change({ id: "c5", kind: "same_role_new" }),
  ]);
  assert.equal(r.omitted, 2, "위험 변경이 아닌 줄(c5)은 소식 대상이 아니라 센 것에도 안 든다");
  assert.deepEqual(r.items.map((i) => i.id), ["vuln:c1", "vuln:c4"]);
  assert.deepEqual([r.items[0].title, r.items[0].url, r.items[0].summary, r.items[0].kind, r.items[0].source], ["mcp-remote에서 새 취약점이 알려졌어요 (GHSA-1)", "https://osv.dev/vulnerability/GHSA-2", "심각한 취약점이 있어요", "vuln", "OSV 취약점 DB"]);
  assert.equal(r.items[1].title, "배열로 온 이름에서 새 취약점이 알려졌어요 (GHSA-1)");
});

const trend = (over: Partial<Trending> = {}): Trending => ({ id: "t1", name: "fast-mcp", score: 40, link: "https://github.com/acme/fast-mcp", at: "2026-11-20T06:00:00.000Z", reasons: [{ kind: "stars", gain: 80, stars: 900 }], ...over });

test("요즘 뜨는 소식: HN 글 주소가 있으면 그것, 없으면 저장소 주소, 주소나 신호 날짜가 없으면 빼고 센다 — 날짜는 신호가 읽힌 때(지금이 아님)", () => {
  const hn = { kind: "hn" as const, points: 120, comments: 8, title: "글", url: "https://news.ycombinator.com/item?id=9" };
  const r = trendingNews([trend({ reasons: [{ kind: "stars", gain: 80, stars: 900 }, hn] }), trend({ id: "t2" }), trend({ id: "t3", link: null }), trend({ id: "t4", at: null })]);
  assert.equal(r.omitted, 2);
  assert.deepEqual([r.items[0].url, r.items[0].summary, r.items[0].source], ["https://news.ycombinator.com/item?id=9", "이번 주 별 +80 · Hacker News 120점", "Hacker News · GitHub"]);
  assert.deepEqual([r.items[1].url, r.items[1].summary, r.items[1].source, r.items[1].official], ["https://github.com/acme/fast-mcp", "이번 주 별 +80", "GitHub", false]);
  assert.equal(r.items[0].publishedAt, "2026-11-20T06:00:00.000Z");
});

test("새 공식 스킬 · 플러그인: 종류 이름, 저장소 주소가 출처, 주소가 없으면 빼고 센다", () => {
  const r = officialNews([
    { id: "s", display_name: "doc-skill", type: "skill", repo_url: "https://github.com/anthropics/skills", created_at: "2026-11-20T00:00:00Z" },
    { id: "p", display_name: "dev-plugin", type: "plugin", repo_url: "https://github.com/anthropics/plugins", created_at: "2026-11-19T00:00:00Z" },
    { id: "n", display_name: "no-repo", type: "skill", repo_url: null, created_at: "2026-11-19T00:00:00Z" },
  ]);
  assert.equal(r.omitted, 1);
  assert.deepEqual(r.items.map((i) => i.title), ["doc-skill — 새 공식 스킬이 카탈로그에 들어왔어요", "dev-plugin — 새 공식 플러그인이 카탈로그에 들어왔어요"]);
});

test("소식판: 바깥 소식은 공식 출처만, 이미 모은 사건 항목은 https 출처 링크만 있으면 통과, 30일 지난 것은 뺀다", () => {
  const base = { publishedAt: "2026-11-20T00:00:00Z", source: "s", tools: [] as string[] };
  const items = [
    { id: "ext-off", title: "공식 아님", url: "https://x.dev/a", official: false, kind: "external" as const, ...base },
    { id: "ext-ok", title: "공식", url: "https://x.dev/c", official: true, kind: "external" as const, ...base },
    { id: "trend", title: "뜨는", url: "https://x.dev/d", official: false, kind: "trending" as const, ...base },
    { id: "http", title: "http", url: "http://x.dev/e", official: false, kind: "trending" as const, ...base },
    { id: "old", title: "옛", url: "https://x.dev/f", official: false, kind: "vuln" as const, ...base, publishedAt: "2026-10-01T00:00:00Z" },
  ];
  assert.deepEqual(newsBoard(items, NOW).map((i) => i.id).sort(), ["ext-ok", "trend"]);
});
