import { test } from "node:test";
import assert from "node:assert/strict";
import { bestPerTarget, matchesKeyword, parseStoryLink, readHits, sameSignal, signalOf, targetKey, typeGuess, type HnHit } from "./hn.ts";

test("글 주소 → 저장소·패키지 (주소는 믿지 않는 입력)", () => {
  const cases: [unknown, ReturnType<typeof parseStoryLink>][] = [
    ["https://github.com/modelcontextprotocol/servers", { kind: "github", owner: "modelcontextprotocol", repo: "servers" }],
    ["http://www.github.com/Owner/My-Repo.git", { kind: "github", owner: "Owner", repo: "My-Repo" }],
    ["https://github.com/owner/repo/issues/12?x=1#top", { kind: "github", owner: "owner", repo: "repo" }],
    ["https://github.com/owner", null], // 소유자만
    ["https://github.com/orgs/anthropics/repositories", null],
    ["https://github.com/topics/mcp", null],
    ["https://github.com/sponsors/someone", null],
    ["https://gist.github.com/owner/abc123", null],
    ["https://github.com/../etc", null],
    ["https://npmjs.com/package/mcp-remote", { kind: "npm", name: "mcp-remote" }],
    ["https://www.npmjs.com/package/@ModelContextProtocol/SDK", { kind: "npm", name: "@modelcontextprotocol/sdk" }],
    ["https://www.npmjs.com/package/%40scope%2Fname", null], // 이름 자리에 / 가 숨어 들어옴
    ["https://www.npmjs.com/~someone", null],
    ["javascript:alert(1)", null],
    ["ftp://github.com/owner/repo", null],
    [`https://github.com/owner/${"a".repeat(600)}`, null], // 너무 긴 주소
    ["https://example.com/blog/mcp", null],
    [null, null],
    ["https://github.com/a/%E0%A4%A", null], // 잘못된 % 인코딩
  ];
  for (const [url, want] of cases) assert.deepEqual(parseStoryLink(url), want, String(url).slice(0, 60));
});

test("키워드는 낱말 경계로, 대소문자 무시", () => {
  assert.equal(matchesKeyword("Show HN: an MCP server for Postgres"), true);
  assert.equal(matchesKeyword("MCP-server for git"), true);
  assert.equal(matchesKeyword("Model Context  Protocol explained"), true);
  assert.equal(matchesKeyword("Claude Code tips"), true);
  assert.equal(matchesKeyword("Agent skills for coding"), true);
  assert.equal(matchesKeyword("mcpserver released"), false);
  assert.equal(matchesKeyword("FastMCP 2.0"), false); // 붙어 쓴 이름은 제목만으로는 아님(저장소 이름 검사는 typeGuess)
  assert.equal(matchesKeyword("claude coder"), false);
});

test("얇게 들일 종류는 저장소 이름으로만", () => {
  assert.equal(typeGuess("github-mcp-server"), "mcp");
  assert.equal(typeGuess("FastMCP"), "mcp");
  assert.equal(typeGuess("claude-skills"), "skill");
  assert.equal(typeGuess("awesome-claude-code"), null);
});

const hit = (id: string, points: number, comments = 0, at = 1): HnHit => ({ objectID: id, title: "t", url: null, points, num_comments: comments, created_at_i: at });

test("같은 대상을 가리키는 글은 점수가 높은 하나만(대소문자는 같은 저장소)", () => {
  const a = { kind: "github" as const, owner: "Foo", repo: "Bar" };
  const b = { kind: "github" as const, owner: "foo", repo: "bar" };
  const n = { kind: "npm" as const, name: "x" };
  const best = bestPerTarget([{ target: a, hit: hit("1", 10) }, { target: b, hit: hit("2", 40) }, { target: n, hit: hit("3", 5) }, { target: a, hit: hit("4", 40, 3) }]);
  assert.deepEqual(best.map((x) => x.hit.objectID).sort(), ["3", "4"]);
  assert.equal(targetKey(a), "github:foo/bar");
});

test("신호: 제목의 제어 문자를 지우고 200자로 자름, 글 링크는 HN", () => {
  const s = signalOf({ ...hit("123", 50, 7), title: `Bad\u0000‮title ${"x".repeat(300)}` }, "2026-11-21T00:00:00.000Z");
  assert.equal(s.story_url, "https://news.ycombinator.com/item?id=123");
  assert.equal(s.title.length, 200);
  assert.ok(!/[\u0000‮]/.test(s.title));
  assert.equal(sameSignal({ ...s, seen_at: "다른 시각" }, s), true);
  assert.equal(sameSignal({ ...s, points: 51 }, s), false);
  assert.equal(sameSignal(null, s), false);
});

test("응답 읽기: 모양이 다르면 null, 칸이 빠진 글은 버리고 셈", () => {
  assert.equal(readHits("not json"), null);
  assert.equal(readHits(JSON.stringify({ nope: [] })), null);
  const r = readHits(JSON.stringify({ hits: [{ objectID: "1", title: "a", url: "https://github.com/a/b", points: 12, num_comments: null, created_at_i: 5 }, { objectID: "x", title: "b" }, null] }));
  assert.deepEqual(r, { hits: [{ objectID: "1", title: "a", url: "https://github.com/a/b", points: 12, num_comments: 0, created_at_i: 5 }], invalid: 2 });
});
