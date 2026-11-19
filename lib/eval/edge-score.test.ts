import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeMarkdown, edgeVerdictOf, overallTotals, scoreEdges, type EdgeActual, type EdgeCase } from "./edge-score.ts";
import type { Totals } from "./score.ts";

const ec = (id: string, kind: EdgeCase["kind"], outcome: string, event: boolean): EdgeCase => ({
  id, kind, target: id, source: "SPEC-3.4", input: { type: "judgment", decision: "hold", reason: "", alertKind: "security", fixedVersion: null }, expected: { outcome, event },
});
const ea = (id: string, outcome: string, event: boolean, error?: string): EdgeActual => ({ id, outcome, event, ...(error ? { error } : {}) });

test("경계 사례 판정: 사건이 다르면 놓침·잘못 울림, 사건은 같은데 결과가 다르면 '결과 다름'(수집 오류를 변화 없음으로 본 경우)", () => {
  assert.equal(edgeVerdictOf({ outcome: "수집 오류", event: false }, ea("x", "수집 오류", false)), "맞음");
  assert.equal(edgeVerdictOf({ outcome: "수집 오류", event: false }, ea("x", "변화 없음", false)), "결과 다름");
  assert.equal(edgeVerdictOf({ outcome: "알림 1", event: true }, ea("x", "알림 0", false)), "놓침");
  assert.equal(edgeVerdictOf({ outcome: "알림 0", event: false }, ea("x", "알림 1", true)), "잘못 울림");
});

test("종류별·전체 수를 센다. 실제 결과가 없거나 실패한 사례는 숨기지 않고 실행 실패로 센다", () => {
  const gold = [ec("A", "수집 실패", "수집 오류", false), ec("B", "수집 실패", "수집 오류", false), ec("C", "적용 기회", "알림 1", true), ec("D", "적용 기회", "알림 1", true), ec("E", "두 번 입력", "변경 1", true)];
  const s = scoreEdges(gold, [ea("A", "수집 오류", false), ea("B", "변화 없음", false), ea("C", "알림 1", true), ea("E", "변경 1", true, "터짐")]);
  assert.deepEqual(s.rows.map((r) => r.verdict), ["맞음", "결과 다름", "맞음", "놓침", "맞음"]);
  assert.deepEqual(s.totals, { cases: 5, hit: 2, quietOk: 1, miss: 1, falseAlarm: 0, outcomeWrong: 1, failed: 2 });
  assert.deepEqual(s.byKind["수집 실패"], { cases: 2, right: 1, miss: 0, falseAlarm: 0, outcomeWrong: 1 });
  assert.deepEqual(s.byKind["적용 기회"], { cases: 2, right: 1, miss: 1, falseAlarm: 0, outcomeWrong: 0 });
  assert.match(s.rows[3].note, /실행 실패: 실제 결과 없음/);
  assert.match(s.rows[4].note, /실행 실패: 터짐/);
});

test("전체 수 = 등급 사례 + 경계 사례(등급 사례의 수는 바꾸지 않는다)", () => {
  const grade: Totals = { cases: 12, hit: 6, quietOk: 6, miss: 0, falseAlarm: 0, gradeOk: 8, failed: 0 };
  const edge = scoreEdges([ec("A", "변화 없음", "변화 없음", false)], [ea("A", "바뀜(사건 아님)", false)]).totals;
  assert.deepEqual(overallTotals(grade, edge), { cases: 13, hit: 6, quietOk: 6, miss: 0, falseAlarm: 0, outcomeWrong: 1, failed: 0 });
});

test("줄마다 기대 사건을 함께 둔다", () => {
  const s = scoreEdges([ec("A", "적용 기회", "알림 1", true)], [ea("A", "알림 1", true)]);
  assert.equal(s.rows[0].expectedEvent, true);
});

test("정답 형식이 틀린 사례(모르는 종류·빠진 칸)는 멈추지 않고 실행 실패 줄로 남긴다", () => {
  const badKind = { ...ec("B", "수집 실패", "수집 오류", false), kind: "엉뚱함" } as unknown as EdgeCase;
  const noEvent = { ...ec("C", "수집 실패", "수집 오류", false), expected: { outcome: "수집 오류" } } as unknown as EdgeCase;
  const noSource = { ...ec("D", "수집 실패", "수집 오류", false), source: "" };
  const s = scoreEdges([badKind, noEvent, noSource, ec("A", "수집 실패", "수집 오류", false)], ["A", "B", "C", "D"].map((id) => ea(id, "수집 오류", false)));
  assert.match(s.rows[0].note, /정답 형식 오류: 종류/);
  assert.match(s.rows[1].note, /정답 형식 오류: expected\.event/);
  assert.match(s.rows[2].note, /정답 형식 오류: 출처/);
  assert.deepEqual(s.rows.map((r) => r.verdict), ["결과 다름", "결과 다름", "결과 다름", "맞음"]);
  assert.equal(s.totals.failed, 3);
  assert.equal(s.byKind["수집 실패"].cases, 3, "모르는 종류(B)는 종류별 표에 넣지 않는다");
});

test("id가 겹치면 조용히 합치지 않고 어느 id인지 말하며 멈춘다", () => {
  assert.throws(() => scoreEdges([ec("A", "변화 없음", "x", false), ec("A", "변화 없음", "y", false)], []), /경계 사례 id가 겹침: A/);
});

test("표 칸 안의 | 와 줄바꿈은 표를 깨지 않게 바꾼다", () => {
  const s = scoreEdges([{ ...ec("P", "수집 실패", "a|b", false), target: "줄\n바꿈" }], [ea("P", "a|b", false)]);
  const line = edgeMarkdown(s).split("\n").find((l) => l.startsWith("| P |"))!;
  assert.match(line, /\| 줄 바꿈 \|/);
  assert.match(line, /a\\\|b/);
});

test("결과 표: 같은 점수면 같은 글, 종류별 줄과 사례 줄(출처 포함)이 있다", () => {
  const s = scoreEdges([ec("E1", "거절·보류", "거절 · 조치 기록 안 함", false)], [ea("E1", "거절 · 조치 기록 안 함", false)]);
  const md = edgeMarkdown(s);
  assert.equal(md, edgeMarkdown(s));
  assert.match(md, /\| 거절·보류 \| 1 \| 1 \| 0 \| 0 \| 0 \|/);
  assert.match(md, /\| E1 \| 거절·보류 \| E1 \| SPEC-3\.4 \| 거절 · 조치 기록 안 함 \| 거절 · 조치 기록 안 함 \| 맞음 \|/);
});
