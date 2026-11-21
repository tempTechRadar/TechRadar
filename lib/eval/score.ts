// 채점(PRD-F30, SPEC-10): 정답(eval/gold.json)과 실제 결과를 비교해 맞음·놓침·잘못 울림 수를 낸다. DB·파일을 모르는 순수 함수.
import type { Grade } from "../domain/grade.ts";

export type GoldInput =
  | { type: "osv"; fixture: string; package: string }
  // repo: 통과 채점용 저장소 확인 값(GitHub에서 읽어 저장한 파일). 없으면 저장소 확인 전으로 본다
  | { type: "osv-batch"; fixture: string; package: string; repo?: { fixture: string } }
  | { type: "skill"; dir: string };

export type GoldCase = {
  id: string;
  target: string;
  version: string | null;
  /** 실수집 = 실제 공개 자료로 정답이 정해짐, 가상 = 일부러 만든 시험용 */
  origin: "실수집" | "가상";
  input: GoldInput;
  /** grades: 허용하는 기대 등급(G5는 통과 또는 주의). event: 사건(위험이 됨)이 나와야 하는가 */
  expected: { grades: Grade[]; event: boolean; causeId?: string };
};

export type Actual = { id: string; grade: Grade; event: boolean; causeId: string | null; error?: string };

export type Verdict = "맞음" | "놓침" | "잘못 울림";

export type Row = {
  id: string;
  target: string;
  origin: GoldCase["origin"];
  expectedGrade: string;
  actualGrade: Grade;
  gradeOk: boolean;
  /** 원인 정답이 있을 때만 true/false, 없으면 null */
  causeOk: boolean | null;
  verdict: Verdict;
  note: string;
};

export type Totals = { cases: number; hit: number; quietOk: number; miss: number; falseAlarm: number; gradeOk: number; failed: number };
export type Score = { rows: Row[]; totals: Totals };

export const GRADE_KO: Record<Grade, string> = { pass: "통과", caution: "주의", danger: "위험", unknown: "찾지 못함" };

/** 사건 기준 판정: 울려야 할 때 울림·안 울려야 할 때 조용함 = 맞음 */
export function verdictOf(expectedEvent: boolean, actualEvent: boolean): Verdict {
  if (expectedEvent && !actualEvent) return "놓침";
  if (!expectedEvent && actualEvent) return "잘못 울림";
  return "맞음";
}

function rowOf(c: GoldCase, a: Actual | undefined): Row {
  const actual: Actual = a ?? { id: c.id, grade: "unknown", event: false, causeId: null, error: "실제 결과 없음" };
  const causeOk = c.expected.causeId ? actual.causeId === c.expected.causeId : null;
  const notes = [actual.error ? `실행 실패: ${actual.error}` : "", causeOk === false ? `원인 다름(기대 ${c.expected.causeId})` : ""].filter(Boolean);
  return {
    id: c.id,
    target: c.target,
    origin: c.origin,
    expectedGrade: c.expected.grades.map((g) => GRADE_KO[g]).join(" 또는 "),
    actualGrade: actual.grade,
    gradeOk: c.expected.grades.includes(actual.grade),
    causeOk,
    verdict: verdictOf(c.expected.event, actual.event),
    note: notes.join(" · "),
  };
}

/** 정답 순서대로 한 줄씩. 실제 결과가 빠진 사례는 "찾지 못함·사건 없음"으로 본다(숨기지 않음). */
export function scoreCases(gold: GoldCase[], actuals: Actual[]): Score {
  const byId = new Map(actuals.map((a) => [a.id, a]));
  const rows = gold.map((c) => rowOf(c, byId.get(c.id)));
  const count = (f: (r: Row) => boolean) => rows.filter(f).length;
  const expectedEvent = new Map(gold.map((c) => [c.id, c.expected.event]));
  return {
    rows,
    totals: {
      cases: rows.length,
      hit: count((r) => r.verdict === "맞음" && expectedEvent.get(r.id) === true),
      quietOk: count((r) => r.verdict === "맞음" && expectedEvent.get(r.id) === false),
      miss: count((r) => r.verdict === "놓침"),
      falseAlarm: count((r) => r.verdict === "잘못 울림"),
      gradeOk: count((r) => r.gradeOk),
      failed: gold.filter((c) => !byId.has(c.id) || byId.get(c.id)?.error).length,
    },
  };
}

/** 사람이 읽는 결과 표(eval/result.md). 같은 점수면 같은 글(시각은 밖에서 넣는다). */
export function toMarkdown(score: Score, meta: { when: string; ruleVersion: string }): string {
  const t = score.totals;
  const lines = [
    "# 채점 결과 (PRD-F30)",
    "",
    `- 언제: ${meta.when} · 등급 규칙 ${meta.ruleVersion} · 정답: eval/gold.json (SPEC-10)`,
    `- 사건: 맞게 울림 ${t.hit} · 맞게 조용함 ${t.quietOk} · **놓침 ${t.miss}** · **잘못 울림 ${t.falseAlarm}** (사례 ${t.cases})`,
    `- 등급 맞음 ${t.gradeOk}/${t.cases} · 실행 실패 ${t.failed}`,
    "",
    "| 사례 | 대상 | 출처 | 기대 등급 | 실제 등급 | 등급 | 사건 판정 | 비고 |",
    "|---|---|---|---|---|---|---|---|",
    ...score.rows.map((r) => `| ${r.id} | ${r.target} | ${r.origin} | ${r.expectedGrade} | ${GRADE_KO[r.actualGrade]} | ${r.gradeOk ? "맞음" : "다름"} | ${r.verdict} | ${r.note} |`),
  ];
  return lines.join("\n") + "\n";
}
