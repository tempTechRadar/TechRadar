import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { MAX_FEEDS, NEWS_FEEDS, releasesUrl } from "./news-feeds.ts";
import { MAX_ENTRIES, MAX_UNDATED, parseFeed, parseReleases } from "./news-parse.ts";

const NOW = Date.parse("2026-11-22T00:00:00Z");

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>블로그</title><link>https://example.com/</link>
<item><title><![CDATA[새 기능 &amp; 개선]]></title><link>https://example.com/a?x=1&amp;y=2</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>
<description><![CDATA[<p>첫 <b>문단</b>입니다.</p><script>alert(1)</script>]]></description></item>
<item><title>두 번째 &#47568; &#x1F600;</title><link>https://example.com/b</link><pubDate>Thu, 19 Nov 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom"><title>피드</title><link rel="self" href="https://example.com/feed"/>
<entry><title type="html">&lt;i&gt;Atom&lt;/i&gt; 글</title><link rel="self" href="https://example.com/self"/><link rel="alternate" href="https://example.com/post?a=1&amp;b=2"/>
<published>2026-11-18T10:00:00Z</published><updated>2026-11-19T10:00:00Z</updated><summary type="html">&lt;p&gt;요약 &amp;amp; 글&lt;/p&gt;</summary></entry>
<entry><title>업데이트만 있는 글</title><link href="https://example.com/c"/><updated>2026-11-17T10:00:00Z</updated><content>본문 전체</content></entry></feed>`;

test("RSS: 제목 · 주소 · 날짜 · 요약을 글자만 읽는다(CDATA · 글자 코드 · 태그 · 스크립트)", () => {
  const e = parseFeed(RSS, NOW);
  assert.equal(e.length, 2);
  assert.deepEqual(e[0], { title: "새 기능 & 개선", url: "https://example.com/a?x=1&y=2", publishedAt: "2026-11-20T09:00:00.000Z", summary: "첫 문단 입니다. alert(1)" });
  assert.equal(e[1].title, "두 번째 말 😀");
  assert.equal(e[1].summary, null);
});

test("Atom: rel=alternate 링크 · published가 없으면 updated · 요약이 없으면 본문, 이스케이프된 태그도 글자만", () => {
  const e = parseFeed(ATOM, NOW);
  assert.deepEqual(e[0], { title: "Atom 글", url: "https://example.com/post?a=1&b=2", publishedAt: "2026-11-18T10:00:00.000Z", summary: "요약 & 글" });
  assert.deepEqual([e[1].url, e[1].publishedAt, e[1].summary], ["https://example.com/c", "2026-11-17T10:00:00.000Z", "본문 전체"]);
});

test("바깥 글을 믿지 않는다: https가 아닌 주소 · 로그인 정보가 든 주소 · 날짜 없음 · 미래 날짜 · 제목 없음은 그 항목만 버린다", () => {
  const item = (inside: string) => `<item>${inside}</item>`;
  const ok = item("<title>정상</title><link>https://example.com/ok</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>");
  const xml = `<rss><channel>${ok}
    ${item("<title>js</title><link>javascript:alert(1)</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>")}
    ${item("<title>http</title><link>http://example.com/x</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>")}
    ${item("<title>cred</title><link>https://user:pw@example.com/x</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>")}
    ${item("<title>날짜없음</title><link>https://example.com/n</link>")}
    ${item("<title>미래</title><link>https://example.com/f</link><pubDate>Fri, 20 Nov 2030 09:00:00 GMT</pubDate>")}
    ${item("<title> </title><link>https://example.com/t</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate>")}
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml, NOW).map((x) => x.title), ["정상"]);
});

test("긴 제목 · 요약은 자르고, 항목은 MAX_ENTRIES개까지만", () => {
  const long = `<item><title>${"가".repeat(500)}</title><link>https://example.com/l</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate><description>${"나".repeat(900)}</description></item>`;
  const e = parseFeed(`<rss><channel>${long}</channel></rss>`, NOW);
  assert.equal(e[0].title.length, 300);
  assert.equal(e[0].summary!.length, 400);
  const many = Array.from({ length: 80 }, (_, i) => `<item><title>t${i}</title><link>https://example.com/${i}</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate></item>`).join("");
  assert.equal(parseFeed(`<rss><channel>${many}</channel></rss>`, NOW).length, MAX_ENTRIES);
});

test("하나도 못 읽으면 '소식 없음'이 아니라 던진다(모양이 바뀐 피드 · 피드가 아닌 글 · 전부 이상한 항목)", () => {
  assert.throws(() => parseFeed("<html><body>점검 중</body></html>", NOW), /RSS · Atom 모양이 아니에요/);
  assert.throws(() => parseFeed("<rss><channel><title>빈</title></channel></rss>", NOW), /항목을 하나도 읽지 못했어요\(찾은 조각 0개/);
  assert.throws(() => parseFeed("<rss><channel><item><title>링크없음</title></item></channel></rss>", NOW), /찾은 조각 1개/);
  assert.throws(() => parseFeed("", NOW), /모양이 아니에요/);
});

test("안 닫힌 태그가 많아도 오래 걸리지 않는다", () => {
  const xml = `<rss><channel>${"<item><title>x".repeat(20000)}</channel></rss>`;
  const t0 = Date.now();
  assert.throws(() => parseFeed(xml, NOW), /하나도 읽지 못했어요/);
  assert.ok(Date.now() - t0 < 1000);
});

test("GitHub 릴리스: 초안은 버리고, 이름이 없으면 태그 이름, 본문은 글자만 짧게, https가 아닌 주소는 버림", () => {
  const json = JSON.stringify([
    { name: "v2.0.1", tag_name: "v2.0.1", html_url: "https://github.com/acme/tool/releases/tag/v2.0.1", published_at: "2026-11-20T01:00:00Z", body: "## 바뀐 것\n- **빠름** `fix` > 고침\n" },
    { name: "", tag_name: "v2.0.0", html_url: "https://github.com/acme/tool/releases/tag/v2.0.0", published_at: "2026-11-10T01:00:00Z", body: null },
    { name: "초안", tag_name: "v3", html_url: "https://github.com/acme/tool/releases/tag/v3", published_at: "2026-11-21T01:00:00Z", draft: true },
    { name: "http", tag_name: "v1", html_url: "http://github.com/x", published_at: "2026-11-01T01:00:00Z" },
  ]);
  const e = parseReleases(json, NOW);
  assert.deepEqual(e.map((x) => x.title), ["v2.0.1", "v2.0.0"]);
  assert.equal(e[0].summary, "바뀐 것 - 빠름 fix 고침");
  assert.equal(e[1].summary, null);
});

test("GitHub 릴리스: 빈 목록은 소식 없음, 목록이 아니거나 하나도 못 읽으면 던진다", () => {
  assert.deepEqual(parseReleases("[]", NOW), []);
  assert.throws(() => parseReleases("{}", NOW), /목록이 아니에요/);
  assert.throws(() => parseReleases("깨짐", NOW), /해석하지 못했어요/);
  assert.throws(() => parseReleases(JSON.stringify([{ name: "x" }]), NOW), /하나도 읽지 못했어요/);
});

test("피드 목록: 약관을 확인한 것만 · 주소는 https · 키는 겹치지 않고 · 10개 이하 · 금지된 출처 없음", () => {
  assert.ok(NEWS_FEEDS.length >= 1 && NEWS_FEEDS.length <= MAX_FEEDS);
  assert.equal(new Set(NEWS_FEEDS.map((f) => f.key)).size, NEWS_FEEDS.length);
  for (const f of NEWS_FEEDS) {
    if (f.kind === "feed") assert.ok(f.url.startsWith("https://"), f.key);
    else assert.ok(releasesUrl(f.repo), f.key);
    assert.ok(f.tools.length > 0 && f.label.length > 0, f.key);
  }
  const urls = JSON.stringify(NEWS_FEEDS);
  for (const banned of ["openai.com", "cursor.com", "releases.atom"]) assert.ok(!urls.includes(banned), `${banned}은 약관 · robots가 막아 안 쓴다`);
});

test("릴리스 주소: 저장소 이름이 이상하면 만들지 않는다", () => {
  assert.equal(releasesUrl("anthropics/claude-code"), "https://api.github.com/repos/anthropics/claude-code/releases?per_page=10");
  for (const bad of ["", "a", "a/b/c", "../x", "a/..", "a b/c", "a/b?x=1", "a/b#"]) assert.equal(releasesUrl(bad), null, bad);
});

test("주소는 정리한 뒤의 길이도 2000자 이하여야 한다(퍼센트 인코딩으로 길어지는 주소를 버림)", () => {
  const item = (path: string) => `<item><title>긴 주소</title><link>https://example.com/${path}</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate></item>`;
  const fine = `<item><title>정상</title><link>https://example.com/ok</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate></item>`;
  // 한글 600자 = 정리하면 %XX가 3배(%EA%B0%80 …)로 늘어 2000자를 넘는다
  assert.deepEqual(parseFeed(`<rss><channel>${item("가".repeat(600))}${fine}</channel></rss>`, NOW).map((x) => x.title), ["정상"]);
});

// 2026-11-23에 실제로 받은 Google 개발자 블로그 응답(앞 3항목, 줄 수만 줄임): 항목에 title · link · description · guid뿐이고 날짜 칸이 없다.
const GOOGLE_DEV = readFileSync(new URL("./fixtures/news-google-developers-undated.xml", import.meta.url), "utf8");

test("날짜 칸이 없는 피드: 그대로는 읽지 못한다(조용히 비우지 않고 던진다)", () => {
  assert.throws(() => parseFeed(GOOGLE_DEV, NOW), /항목을 하나도 읽지 못했어요\(찾은 조각 3개/);
});

test("날짜 칸이 없는 피드: undatedMs를 주면 실제 응답 3항목을 읽은 때 날짜로 받는다", () => {
  const e = parseFeed(GOOGLE_DEV, NOW, NOW);
  assert.equal(e.length, 3);
  assert.ok(e.every((x) => x.publishedAt === new Date(NOW).toISOString() && x.url.startsWith("https://developers.googleblog.com/") && x.title && x.summary));
});

test("날짜 칸이 없는 피드: 읽은 때를 날짜로 쓰는 항목은 MAX_UNDATED개까지만", () => {
  const item = (i: number) => `<item><title>글 ${i}</title><link>https://example.com/${i}</link></item>`;
  const xml = `<rss><channel>${Array.from({ length: 9 }, (_, i) => item(i)).join("")}</channel></rss>`;
  assert.deepEqual(parseFeed(xml, NOW, NOW).map((x) => x.title), Array.from({ length: MAX_UNDATED }, (_, i) => `글 ${i}`));
});

test("undatedMs를 줘도 날짜 칸이 있는데 못 읽는 항목은 여전히 버린다(모양이 바뀐 것을 가리지 않음)", () => {
  const xml = `<rss><channel><item><title>깨짐</title><link>https://example.com/x</link><pubDate>어제쯤</pubDate></item></channel></rss>`;
  assert.throws(() => parseFeed(xml, NOW, NOW), /하나도 읽지 못했어요/);
});

test("undatedMs를 줘도 날짜가 있는 항목은 그 날짜를 쓴다", () => {
  const xml = `<rss><channel><item><title>있음</title><link>https://example.com/d</link><pubDate>Fri, 20 Nov 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
  assert.equal(parseFeed(xml, NOW, NOW)[0].publishedAt, "2026-11-20T09:00:00.000Z");
});
