import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFacts, STALE_DAYS, type CheckTech, type Fact, type SameRolePair } from "./check-facts.ts";
import { createStage, putTech, addStage, connect, emptyGraph, type Graph } from "./graph.ts";

const NOW = new Date("2026-11-22T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tech = (n: number, over: Partial<CheckTech> = {}): CheckTech => ({
  id: id(n), name: `기술${n}`, techKey: `npm:t${n}`, type: "sdk", grade: "pass", gradeReason: null,
  lastActivityAt: daysAgo(10), lastActivityKind: "commit", collectErrorKind: null, link: `https://github.com/acme/t${n}`, ...over,
});
/** 단계 이름 → 기술 번호들. 앞 단계 → 뒤 단계로 이어 붙인다(이름 = id) */
function graphOf(stages: [string, number[]][]): Graph {
  let g = emptyGraph();
  stages.forEach(([name, ts], i) => {
    const s = { ...createStage(name, i * 320, 0), id: name };
    g = addStage(g, s);
    for (const n of ts) g = putTech(g, name, { id: id(n), name: `기술${n}` });
    if (i > 0) g = connect(g, stages[i - 1][0], name);
  });
  return g;
}
const run = (g: Graph, techs: CheckTech[], sameRole: SameRolePair[] = []) => checkFacts({ graph: g, techs, sameRole, now: NOW });
const kinds = (f: Fact[]) => f.map((x) => x.kind);

test("점검 사실: 문제 없는 청사진과 빈 청사진은 사실이 없다(없다 = 알려 줄 것이 없다)", () => {
  assert.deepEqual(run(graphOf([["기획", [1]], ["개발", [2]]]), [tech(1), tech(2)]), []);
  assert.deepEqual(run(emptyGraph(), []), []);
});

test("점검 사실: 위험 · 주의 등급은 이유와 출처 링크를 달고, 통과는 사실이 아니다", () => {
  const f = run(graphOf([["개발", [1, 2, 3]]]), [tech(1, { grade: "danger", gradeReason: "심각한 취약점 2건" }), tech(2, { grade: "caution", gradeReason: "라이선스가 없어요" }), tech(3)]);
  assert.deepEqual(kinds(f), ["danger", "caution"]);
  assert.equal(f[0].severity, "risk");
  assert.match(f[0].text, /"기술1"은\(는\) 위험 등급이에요: 심각한 취약점 2건/);
  assert.deepEqual([f[0].stageIds, f[0].techIds], [["개발"], [id(1)]]);
  assert.equal(f[0].source.url, "https://github.com/acme/t1");
  assert.match(f[0].source.label, /OSV/);
  assert.equal(run(graphOf([["개발", [1]]]), [tech(1, { grade: "caution", gradeReason: "가".repeat(300) })])[0].text.length < 200, true, "긴 이유는 자른다");
});

test("점검 사실: 읽지 못한 것은 '확인하지 못했어요' — 정보 없음 · 등급 못 찾음 · 수집 오류", () => {
  const g = graphOf([["개발", [1, 2, 3]]]);
  const f = run(g, [tech(1, { grade: "unknown" }), tech(2, { grade: "unknown", collectErrorKind: "rate_limited" })]); // 3번 기술은 정보 자체가 없음
  assert.deepEqual(kinds(f), ["unread", "collect_error", "unread"]);
  assert.match(f[0].text, /"기술1"은\(는\) 아직 등급을 찾지 못해서 확인하지 못했어요/);
  assert.match(f[1].text, /"기술2"은\(는\) 마지막 수집에서 요청 한도에 걸렸어요\. 그 부분은 확인하지 못했어요/);
  assert.match(f[2].text, /"기술3"의 정보를 읽지 못해서 확인하지 못했어요/);
  assert.ok(f.every((x) => x.severity === "info"));
  assert.ok(f.every((x) => !/문제 없|안전|통과/.test(x.text)), "읽지 못한 것을 괜찮다고 쓰지 않는다");
});

test("점검 사실: 수집 오류가 있어도 이미 찾은 위험은 그대로 알리고, 오래됨은 말하지 않는다", () => {
  const f = run(graphOf([["개발", [1]]]), [tech(1, { grade: "danger", gradeReason: "취약점", collectErrorKind: "network", lastActivityAt: daysAgo(900) })]);
  assert.deepEqual(kinds(f), ["danger", "collect_error"]);
});

test("점검 사실: 개념은 등급 · 저장소가 없어 아무 사실도 만들지 않는다", () => {
  const concept = tech(1, { techKey: "concept:rag", type: "concept", grade: "unknown", lastActivityAt: daysAgo(900) });
  assert.deepEqual(run(graphOf([["개발", [1]]]), [concept]), []);
});

test("점검 사실: 오래된 릴리스 · 변경(365일 경계), 활동 날짜를 모르면 '확인하지 못했어요'", () => {
  const one = (over: Partial<CheckTech>) => run(graphOf([["개발", [1]]]), [tech(1, over)]);
  assert.deepEqual(one({ lastActivityAt: daysAgo(STALE_DAYS - 1) }), []);
  const old = one({ lastActivityAt: daysAgo(STALE_DAYS), lastActivityKind: "release" });
  assert.deepEqual(kinds(old), ["stale"]);
  assert.match(old[0].text, /"기술1"은\(는\) 마지막 릴리스가 12개월 전이에요\(2025-11-22\)/);
  assert.equal(old[0].severity, "warn");
  assert.equal(old[0].source.label, "저장소 활동 기록");
  assert.match(one({ lastActivityAt: daysAgo(400), lastActivityKind: "commit" })[0].text, /마지막 변경이 13개월 전/);
  assert.deepEqual(one({ lastActivityAt: daysAgo(0) }), [], "오늘 활동은 말할 것 없음");
  for (const [label, lastActivityAt] of [["비어 있음", null], ["읽을 수 없는 시각", "어제쯤"], ["미래 시각", daysAgo(-30)]] as const) {
    const f = one({ lastActivityAt });
    assert.deepEqual(kinds(f), ["unread"], label);
    assert.equal(f[0].severity, "info", label);
    assert.match(f[0].text, /"기술1"의 마지막 활동 날짜를 확인하지 못했어요/, label);
    assert.deepEqual(f[0].source, { label: "저장소 활동 기록", url: "https://github.com/acme/t1" }, label);
  }
  assert.deepEqual(kinds(one({ lastActivityAt: null, collectErrorKind: "network" })), ["collect_error"], "수집 오류가 있으면 그 사실 하나만(날짜 얘기는 따로 안 함)");
});

test("점검 사실: 겹치는 기능은 확정된 같은 역할만 — 같은 단계 · 다른 단계 · 순서 뒤집힌 중복 · 그래프에 없는 짝", () => {
  const g = graphOf([["저장", [1, 2]], ["배포", [3]]]);
  const pairs: SameRolePair[] = [
    { a: id(1), b: id(2), quote: "둘 다 데이터베이스", confirmedAt: "2026-11-12T03:00:00Z" },
    { a: id(2), b: id(1), quote: null, confirmedAt: null }, // 같은 짝(순서만 반대)
    { a: id(2), b: id(3), quote: null, confirmedAt: null },
    { a: id(1), b: id(99), quote: null, confirmedAt: null }, // 99는 청사진에 없음
    { a: id(1), b: id(1), quote: null, confirmedAt: null },
  ];
  const f = run(g, [tech(1), tech(2), tech(3)], pairs);
  assert.deepEqual(kinds(f), ["overlap", "overlap"]);
  assert.match(f[0].text, /"기술1"과\(와\) "기술2"는 같은 역할이라고 확인된 기술인데 "저장" 단계에 같이 있어요\. 근거: "둘 다 데이터베이스"/);
  assert.equal(f[0].source.label, "같은 역할 관계(관리자 확인 2026-11-12)");
  assert.deepEqual([f[0].stageIds, f[0].techIds], [["저장"], [id(1), id(2)]]);
  assert.match(f[1].text, /서로 다른 단계\("저장", "배포"\)에 있어요/);
  assert.deepEqual(f[1].stageIds, ["저장", "배포"]);
});

test("점검 사실: 빈 단계", () => {
  const f = run(graphOf([["기획", []], ["개발", [1]]]), [tech(1)]);
  assert.deepEqual(kinds(f), ["empty_stage"]);
  assert.deepEqual([f[0].stageIds, f[0].techIds, f[0].source.label], [["기획"], [], "이 청사진"]);
});

test("점검 사실: 무게 순(위험 → 주의 · 겹침 · 오래됨 → 확인 못 함 · 빈 단계), 같은 무게는 순서 단계 순 뒤에 겹침", () => {
  const g = graphOf([["기획", []], ["설계", [1]], ["개발", [2, 3]]]);
  const f = run(g, [tech(1, { grade: "unknown" }), tech(2, { grade: "caution", gradeReason: "주의" }), tech(3, { grade: "danger", gradeReason: "위험" })], [{ a: id(2), b: id(3), quote: null, confirmedAt: null }]);
  assert.deepEqual(kinds(f), ["danger", "caution", "overlap", "empty_stage", "unread"]);
  assert.deepEqual(f.map((x) => x.severity), ["risk", "warn", "warn", "info", "info"]);
});

test("점검 사실: 사실마다 출처 이름이 있고, 고리가 있어도 죽지 않는다", () => {
  const g = graphOf([["기획", [1]], ["개발", [2]]]);
  const f = run(g, [tech(1, { grade: "danger", gradeReason: "x" }), tech(2, { grade: "unknown", collectErrorKind: "parse", lastActivityAt: daysAgo(999) })]);
  assert.ok(f.length > 0 && f.every((x) => x.source.label.length > 0));
  const ring: Graph = { ...g, edges: [{ from: "기획", to: "개발" }, { from: "개발", to: "기획" }] };
  assert.deepEqual(kinds(run(ring, [tech(1, { grade: "danger" }), tech(2)])), ["danger"]);
});
