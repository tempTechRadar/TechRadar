import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidateKey, flagsOf, oneLinerOf, passesGate, percentiles, pickTop, planCandidates, readSearchPage, scoreByTag, typeOf,
  type Candidate, type Scored, type SearchRepo,
} from "./star-candidates.ts";

const NOW = Date.parse("2026-11-21T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const repo = (name: string, over: Partial<SearchRepo> = {}): SearchRepo => {
  const [owner, r] = name.split("/");
  return {
    owner, repo: r, fullName: name, htmlUrl: `https://github.com/${name}`, description: "d", stars: 2000, forks: 100, pushedAt: ago(5), createdAt: ago(400),
    archived: false, fork: false, license: "MIT", ownerType: "User", ...over,
  };
};
const cand = (name: string, over: Partial<Candidate> = {}): Candidate => ({ ...repo(name), tags: ["mcp"], inRegistry: false, ...over });
const item = (over: Record<string, unknown> = {}) => ({
  full_name: "Acme/Tool", html_url: "https://github.com/Acme/Tool", description: "a tool", stargazers_count: 1500, forks_count: 30,
  pushed_at: ago(2), created_at: ago(300), archived: false, fork: false, license: { spdx_id: "MIT" }, owner: { login: "Acme", type: "Organization" }, topics: ["mcp"], ...over,
});
const page = (items: unknown[], over: Record<string, unknown> = {}) => JSON.stringify({ total_count: items.length, incomplete_results: false, items, ...over });

test("검색 응답 읽기: 필요한 칸을 모양대로 옮긴다. 라이선스 없음은 null, 못 알아본 라이선스는 other", () => {
  const p = readSearchPage(page([item(), item({ full_name: "b/x", license: null }), item({ full_name: "c/y", license: { spdx_id: "NOASSERTION" } })]))!;
  assert.equal(p.total, 3);
  assert.deepEqual(p.items[0], {
    owner: "Acme", repo: "Tool", fullName: "Acme/Tool", htmlUrl: "https://github.com/Acme/Tool", description: "a tool", stars: 1500, forks: 30,
    pushedAt: ago(2), createdAt: ago(300), archived: false, fork: false, license: "MIT", ownerType: "Organization",
  });
  assert.deepEqual(p.items.slice(1).map((i) => i.license), [null, "other"]);
});

test("검색 응답 모양이 다르면 null: 일부만 읽고 '이게 전부'라 하지 않는다(불변 2)", () => {
  for (const bad of ["{", "[]", JSON.stringify({ items: [] }), page([item({ stargazers_count: "1" })]), page([item({ full_name: "../x" })]), page([item({ owner: null })]), page([item({ pushed_at: "어제" })])]) {
    assert.equal(readSearchPage(bad), null, bad.slice(0, 60));
  }
  assert.equal(readSearchPage(page([item({ pushed_at: null })]))!.items[0].pushedAt, null);
});

test("관문: 보관·포크·마지막 푸시 12개월 넘음·푸시 없음은 떨어진다", () => {
  const table: [Partial<SearchRepo>, boolean][] = [
    [{}, true], [{ archived: true }, false], [{ fork: true }, false], [{ pushedAt: ago(365) }, true], [{ pushedAt: ago(366) }, false], [{ pushedAt: null }, false],
  ];
  for (const [over, ok] of table) assert.equal(passesGate(repo("a/b", over), NOW), ok, JSON.stringify(over));
});

test("new_spike 경계: 생성 30일 미만이고 별 500 이상일 때만", () => {
  const flags = (createdDays: number, stars: number) => flagsOf([repo("a/b", { createdAt: ago(createdDays), stars })], NOW).get("github:a/b");
  assert.deepEqual(flags(29, 500), ["new_spike"]);
  assert.deepEqual(flags(29, 499), []);
  assert.deepEqual(flags(30, 500), []);
});

test("clone_cluster 경계: 같은 이름(대소문자 무시)·다른 소유자 2곳 이상·별 차이가 최대의 5% 이하. 생성일이 가장 이른 것(원본)은 표시하지 않는다", () => {
  // 두 번째가 나중에 만들어진 복제본
  const pair = (a: number, b: number, owners = ["x", "y"], names = ["tool", "Tool"]) =>
    flagsOf([repo(`${owners[0]}/${names[0]}`, { stars: a, createdAt: ago(400) }), repo(`${owners[1]}/${names[1]}`, { stars: b, createdAt: ago(60) })], NOW);
  assert.deepEqual([...pair(1000, 950).values()], [[], ["clone_cluster"]]);
  assert.deepEqual([...pair(950, 1000).values()], [[], ["clone_cluster"]], "별이 더 많아도 나중에 만든 쪽이 복제본");
  assert.deepEqual([...pair(1000, 949).values()], [[], []]);
  assert.deepEqual([...pair(1000, 1000, ["x", "X"]).values()], [[]], "같은 소유자(대소문자만 다름)는 묶음이 아님");
  assert.deepEqual([...pair(1000, 1000, ["x", "y"], ["tool", "other"]).values()], [[], []]);
  const three = flagsOf([repo("a/t", { createdAt: ago(50) }), repo("b/t", { createdAt: ago(500) }), repo("c/t", { createdAt: ago(40) })], NOW);
  assert.deepEqual([...three.entries()], [["github:a/t", ["clone_cluster"]], ["github:b/t", []], ["github:c/t", ["clone_cluster"]]]);
});

test("clone_cluster는 관문을 통과한 저장소끼리만 묶는다: 보관·포크·오래된 같은 이름은 정상 기술을 복제본으로 만들지 않는다", () => {
  for (const over of [{ archived: true }, { fork: true }, { pushedAt: ago(400) }]) {
    const plan = planCandidates([cand("orig/tool", { createdAt: ago(60) }), cand("other/tool", { createdAt: ago(900), ...over })], NOW);
    assert.deepEqual(plan.suspects, [], JSON.stringify(over));
  }
  const plan = planCandidates([cand("orig/tool", { createdAt: ago(900) }), cand("copy/tool", { createdAt: ago(60) })], NOW);
  assert.deepEqual([plan.top.map((t) => t.key), plan.suspects.map((s) => [s.key, s.flags])], [["github:orig/tool"], [["github:copy/tool", ["clone_cluster"]]]]);
});

test("백분위: 같은 값은 같은 자리, 하나뿐이면 1", () => {
  assert.deepEqual(percentiles([10, 20, 30]), [0, 0.5, 1]);
  assert.deepEqual(percentiles([5, 5, 9]), [0.25, 0.25, 1]);
  assert.deepEqual(percentiles([7]), [1]);
});

test("점수는 같은 태그 안 백분위에 가중치: 모든 항목이 가장 높으면 100, 가장 낮으면 0. 성장의 나이 하한은 30일", () => {
  const nowRepo = { pushedAt: ago(1), ownerType: "Organization", license: "MIT", inRegistry: true };
  const best = cand("a/top", { stars: 9000, forks: 900, createdAt: ago(100), ...nowRepo });
  const worst = cand("b/low", { stars: 1000, forks: 1, createdAt: ago(1000), pushedAt: ago(300), ownerType: "User", license: null });
  const s = scoreByTag([best, worst], NOW);
  assert.equal(s.get("github:a/top"), 100);
  assert.equal(s.get("github:b/low"), 0);
  // 생성 1일에 별 1500인 것과 30일에 1500인 것은 성장 값이 같다(하한 30일)
  const young = scoreByTag([cand("c/one", { createdAt: ago(1) }), cand("d/thirty", { createdAt: ago(30) })], NOW);
  assert.equal(young.get("github:c/one"), young.get("github:d/thirty"));
});

test("점수는 태그마다 따로 매기고 여러 태그에 나온 후보는 가장 높은 점수", () => {
  const multi = cand("m/both", { tags: ["mcp", "agent-skills"], stars: 3000 });
  const s = scoreByTag([multi, cand("x/big", { stars: 50_000, forks: 5000 }), cand("y/small", { tags: ["agent-skills"], stars: 1000, forks: 1 })], NOW);
  // mcp 안에서는 x/big에 져서 15, agent-skills 안에서는 y/small을 이겨 85
  assert.equal(scoreByTag([{ ...multi, tags: ["mcp"] }, cand("x/big", { stars: 50_000, forks: 5000 })], NOW).get("github:m/both"), 15);
  assert.equal(s.get("github:m/both"), 85);
});

test("상위 고르기: 점수 → 별 → 키 순, 상한까지만", () => {
  const sc = (name: string, score: number, stars = 1000): Scored => ({ ...cand(name, { stars }), key: candidateKey(cand(name)), score });
  const top = pickTop([sc("a/a", 50), sc("b/b", 90), sc("c/c", 50, 5000), sc("d/d", 10)], 3);
  assert.deepEqual(top.map((t) => t.key), ["github:b/b", "github:c/c", "github:a/a"]);
  assert.equal(pickTop(Array.from({ length: 150 }, (_, i) => sc(`o/r${i}`, i))).length, 100);
});

test("계획: 관문에서 떨어진 것은 버리고, 의심이 붙은 것은 점수에 안 넣고 NEW 후보로 따로", () => {
  const plan = planCandidates([cand("a/ok"), cand("b/old", { archived: true }), cand("c/spike", { createdAt: ago(3), stars: 4000 }), cand("d/ok2", { stars: 1200 })], NOW);
  assert.deepEqual(plan.top.map((t) => t.key), ["github:a/ok", "github:d/ok2"]);
  assert.deepEqual(plan.suspects.map((s) => [s.key, s.flags]), [["github:c/spike", ["new_spike"]]]);
  assert.equal(plan.gated, 1);
  assert.deepEqual(plan.rest.map((r) => [r.key, r.score]), [["github:b/old", null]], "관문 탈락은 점수 없이 나머지로");
});

test("나머지(rest): 상위 100 밖이어도 점수를 갖고 돌아온다(전에 붙인 의심 표시를 지우는 데 씀)", () => {
  const plan = planCandidates(Array.from({ length: 101 }, (_, i) => cand(`o/r${i}`, { stars: 1000 + i })), NOW);
  assert.deepEqual([plan.top.length, plan.rest.length, plan.rest[0].key, typeof plan.rest[0].score], [100, 1, "github:o/r0", "number"]);
});

test("종류 추정·키·한 줄 설명", () => {
  assert.equal(typeOf(["agent-skills", "mcp"]), "mcp");
  assert.equal(typeOf(["claude-skills"]), "skill");
  assert.equal(candidateKey({ owner: "Acme", repo: "Tool" }), "github:acme/tool");
  assert.equal(oneLinerOf("  a \n b  "), "a b");
  assert.equal(oneLinerOf("   "), null);
  assert.equal(oneLinerOf("x".repeat(300))!.length, 200);
});

test("한 줄 설명은 코드 포인트로 자른다: 199·200번째 자리의 이모지(대리쌍)를 반으로 자르지 않는다", () => {
  const cut = oneLinerOf(`${"x".repeat(198)}😀😀${"y".repeat(10)}`)!;
  assert.equal(cut, `${"x".repeat(198)}😀…`);
  assert.ok(cut.isWellFormed(), "짝 없는 대리 문자 없음");
  assert.equal(oneLinerOf(`${"x".repeat(199)}😀`), `${"x".repeat(199)}😀`, "정확히 200 코드 포인트면 그대로");
});
