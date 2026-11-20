import assert from "node:assert/strict";
import test from "node:test";
import { pickRecommendations, type Candidate } from "./recommend.ts";

// 큰 갈래 둘, 작은 갈래 셋
const categories = [
  { id: "b-res", name: "리서치", parentId: null },
  { id: "b-sec", name: "검사·보안", parentId: null },
  { id: "s-web", name: "웹 검색·수집", parentId: "b-res" },
  { id: "s-news", name: "뉴스·트렌드", parentId: "b-res" },
  { id: "s-audit", name: "보안·감사", parentId: "b-sec" },
];

const tech = (id: string, over: Partial<Candidate> = {}): Candidate => ({
  id, techKey: `npm:${id}`, name: id, oneLiner: null, categoryId: "s-web", grade: "pass", status: "active", signals: { weekly_downloads: 100 }, ...over,
});

const pick = (techs: Candidate[], interests = ["리서치"], owned: string[] = []) => pickRecommendations({ interests, categories, techs, ownedIds: owned });

test("고른 큰 갈래 밑의 기술만 나온다 (작은 갈래도 큰 갈래로 센다)", () => {
  const r = pick([tech("a"), tech("b", { categoryId: "s-news" }), tech("c", { categoryId: "s-audit" })]);
  assert.deepEqual(r.map((x) => x.techId).sort(), ["a", "b"]);
});

test("취향을 고르지 않았으면(건너뜀) 빈 목록이다", () => {
  assert.deepEqual(pick([tech("a")], []), []);
});

test("이미 쓰는 기술·지원 종료·사라진·위험 등급은 뺀다", () => {
  const r = pick([
    tech("own"), tech("dep", { status: "deprecated" }), tech("gone", { status: "gone" }), tech("bad", { grade: "danger" }), tech("ok"),
  ], ["리서치"], ["own"]);
  assert.deepEqual(r.map((x) => x.techId), ["ok"]);
});

test("분류 전(갈래 없음) 기술은 어느 취향에도 안 나온다", () => {
  assert.deepEqual(pick([tech("a", { categoryId: null })]), []);
});

test("주간 다운로드가 많은 순, 값이 없는 기술은 맨 뒤", () => {
  const r = pick([
    tech("none", { signals: null }), tech("low", { signals: { weekly_downloads: 10 } }), tech("high", { signals: { weekly_downloads: 5000 } }),
  ]);
  assert.deepEqual(r.map((x) => x.techId), ["high", "low", "none"]);
});

test("이유에 갈래와 다운로드 수, 출처가 있다. 숫자를 못 읽으면 지어내지 않는다", () => {
  const [a, b] = pick([tech("a", { signals: { weekly_downloads: 12345 } }), tech("b", { techKey: "mcp:b", signals: { weekly_downloads: "많음" } })]);
  assert.equal(a.reason, "리서치 · 웹 검색·수집 갈래 · 주간 다운로드 12,345");
  assert.equal(a.source, "npm");
  assert.equal(b.reason, "리서치 · 웹 검색·수집 갈래 · 인기 수치는 아직 없어요");
  assert.equal(b.source, "");
});

test("PyPI 키는 출처가 PyPI", () => {
  const [a] = pick([tech("a", { techKey: "pypi:a" })]);
  assert.equal(a.source, "PyPI");
});

test("최대 개수를 넘기지 않는다 (기본 10)", () => {
  const many = Array.from({ length: 15 }, (_, i) => tech(`t${i}`, { signals: { weekly_downloads: i } }));
  assert.equal(pick(many).length, 10);
  assert.equal(pickRecommendations({ interests: ["리서치"], categories, techs: many, ownedIds: [], limit: 3 }).length, 3);
});
