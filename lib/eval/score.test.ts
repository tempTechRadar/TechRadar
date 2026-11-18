import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreCases, toMarkdown, verdictOf, type Actual, type GoldCase } from "./score.ts";

const gc = (id: string, grades: GoldCase["expected"]["grades"], event: boolean, causeId?: string): GoldCase => ({
  id, target: id, version: "1.0.0", origin: "가상", input: { type: "skill", dir: "x" }, expected: { grades, event, causeId },
});
const act = (id: string, grade: Actual["grade"], causeId: string | null = null): Actual => ({ id, grade, event: grade === "danger", causeId });

test("사건 판정: 울려야 할 때 울림·안 울려야 할 때 조용함은 맞음, 나머지는 놓침·잘못 울림", () => {
  assert.equal(verdictOf(true, true), "맞음");
  assert.equal(verdictOf(false, false), "맞음");
  assert.equal(verdictOf(true, false), "놓침");
  assert.equal(verdictOf(false, true), "잘못 울림");
});

test("맞음·놓침·잘못 울림·등급 맞음 수를 센다", () => {
  const gold = [gc("A", ["danger"], true), gc("B", ["danger"], true), gc("C", ["pass"], false), gc("D", ["pass", "caution"], false)];
  const s = scoreCases(gold, [act("A", "danger"), act("B", "caution"), act("C", "danger"), act("D", "caution")]);
  assert.deepEqual(s.totals, { cases: 4, hit: 1, quietOk: 1, miss: 1, falseAlarm: 1, gradeOk: 2, failed: 0 });
  assert.deepEqual(s.rows.map((r) => r.verdict), ["맞음", "놓침", "잘못 울림", "맞음"]);
});

test("기대 등급이 여러 개(G5: 통과 또는 주의)면 그중 하나면 맞음", () => {
  const s = scoreCases([gc("G5", ["pass", "caution"], false)], [act("G5", "pass")]);
  assert.equal(s.rows[0].gradeOk, true);
  assert.equal(s.rows[0].expectedGrade, "통과 또는 주의");
});

test("원인 정답이 있으면 원인까지 비교하고, 다르면 비고에 적는다", () => {
  const gold = [gc("G1", ["danger"], true, "GHSA-6xpm-ggf7-wc3p")];
  assert.equal(scoreCases(gold, [act("G1", "danger", "GHSA-6xpm-ggf7-wc3p")]).rows[0].causeOk, true);
  const wrong = scoreCases(gold, [act("G1", "danger", "GHSA-other")]).rows[0];
  assert.equal(wrong.causeOk, false);
  assert.match(wrong.note, /원인 다름/);
});

test("실제 결과가 없거나 실패한 사례는 숨기지 않고 '찾지 못함·놓침'과 실행 실패로 센다", () => {
  const gold = [gc("A", ["danger"], true), gc("B", ["pass"], false)];
  const s = scoreCases(gold, [{ id: "B", grade: "unknown", event: false, causeId: null, error: "파일 없음" }]);
  assert.equal(s.rows[0].actualGrade, "unknown");
  assert.equal(s.rows[0].verdict, "놓침");
  assert.match(s.rows[1].note, /실행 실패: 파일 없음/);
  assert.equal(s.totals.failed, 2);
});

test("결과 표: 같은 점수·같은 시각이면 같은 글, 머리 숫자와 사례 줄이 있다", () => {
  const s = scoreCases([gc("A", ["danger"], true)], [act("A", "danger")]);
  const md = toMarkdown(s, { when: "2026. 11. 18.", ruleVersion: "v1" });
  assert.equal(md, toMarkdown(s, { when: "2026. 11. 18.", ruleVersion: "v1" }));
  assert.match(md, /\*\*놓침 0\*\* · \*\*잘못 울림 0\*\*/);
  assert.match(md, /\| A \| A \| 가상 \| 위험 \| 위험 \| 맞음 \| 맞음 \|/);
});

test("정답 파일(eval/gold.json): G1–G9가 모두 있고 출처(실수집·가상)와 기대값이 채워져 있다", () => {
  const gold = (JSON.parse(readFileSync("eval/gold.json", "utf8")) as { cases: GoldCase[] }).cases;
  const ids = new Set(gold.map((c) => c.id.slice(0, 2)));
  for (const g of ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"]) assert.ok(ids.has(g), g);
  for (const c of gold) {
    assert.ok(c.origin === "실수집" || c.origin === "가상", c.id);
    assert.ok(c.expected.grades.length > 0, c.id);
    assert.equal(c.expected.event, c.expected.grades.includes("danger"), `${c.id}: 사건 = 위험`);
  }
  assert.ok(gold.filter((c) => c.id.startsWith("G6") || c.id.startsWith("G9")).every((c) => c.origin === "가상"));
});
