// 경계 사례 채점(PRD-F30): 사건 종류(보안 경고·적용 기회)와 경계(변화 없음·수집 실패·거절·보류·두 번 입력)를 맞음·놓침·잘못 울림으로 센다.
// 등급 사례(score.ts)와 따로 센다: 등급 사례의 수와 표는 그대로 두고, 전체 수만 더한다. DB·파일을 모르는 순수 함수.
import type { EdgeInput } from "./edge.ts";
import type { Totals, Verdict } from "./score.ts";

export const EDGE_KINDS = ["보안 경고", "적용 기회", "변화 없음", "수집 실패", "거절·보류", "두 번 입력"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export type EdgeCase = {
  id: string;
  kind: EdgeKind;
  target: string;
  /** 정답의 근거: SPEC id · G 사례 · 불변 번호 */
  source: string;
  input: EdgeInput;
  /** outcome: 앱이 내야 할 결과(글). event: 사건(새 변경·새 알림·판단 저장)이 생겨야 하는가 */
  expected: { outcome: string; event: boolean };
};

export type EdgeActual = { id: string; outcome: string; event: boolean; note?: string; error?: string };

/** 사건이 같은데 결과가 다르면 "결과 다름": 수집 오류를 변화 없음으로 본 경우처럼 사건 수만으로는 안 보이는 틀림 */
export type EdgeVerdict = Verdict | "결과 다름";

export type EdgeRow = {
  id: string; kind: EdgeKind; target: string; source: string;
  expectedOutcome: string; actualOutcome: string; verdict: EdgeVerdict; note: string;
};
export type EdgeTotals = { cases: number; hit: number; quietOk: number; miss: number; falseAlarm: number; outcomeWrong: number; failed: number };
export type KindTotals = { cases: number; right: number; miss: number; falseAlarm: number; outcomeWrong: number };
export type EdgeScore = { rows: EdgeRow[]; totals: EdgeTotals; byKind: Record<EdgeKind, KindTotals> };

export function edgeVerdictOf(expected: EdgeCase["expected"], actual: Pick<EdgeActual, "outcome" | "event">): EdgeVerdict {
  if (expected.event && !actual.event) return "놓침";
  if (!expected.event && actual.event) return "잘못 울림";
  return expected.outcome === actual.outcome ? "맞음" : "결과 다름";
}

function rowOf(c: EdgeCase, a: EdgeActual | undefined): EdgeRow {
  const actual: EdgeActual = a ?? { id: c.id, outcome: "없음", event: false, error: "실제 결과 없음" };
  const note = [actual.error ? `실행 실패: ${actual.error}` : "", actual.note ?? ""].filter(Boolean).join(" · ");
  return {
    id: c.id, kind: c.kind, target: c.target, source: c.source,
    expectedOutcome: c.expected.outcome, actualOutcome: actual.outcome, verdict: edgeVerdictOf(c.expected, actual), note,
  };
}

function kindTotals(rows: EdgeRow[]): Record<EdgeKind, KindTotals> {
  const out = Object.fromEntries(EDGE_KINDS.map((k) => [k, { cases: 0, right: 0, miss: 0, falseAlarm: 0, outcomeWrong: 0 }])) as Record<EdgeKind, KindTotals>;
  const field = { 맞음: "right", 놓침: "miss", "잘못 울림": "falseAlarm", "결과 다름": "outcomeWrong" } as const;
  for (const r of rows) {
    out[r.kind].cases++;
    out[r.kind][field[r.verdict]]++;
  }
  return out;
}

/** 정답 순서대로 한 줄씩. 실제 결과가 빠진 사례는 "없음·사건 없음"으로 본다(숨기지 않음). */
export function scoreEdges(gold: EdgeCase[], actuals: EdgeActual[]): EdgeScore {
  const byId = new Map(actuals.map((a) => [a.id, a]));
  const rows = gold.map((c) => rowOf(c, byId.get(c.id)));
  const ok = (r: EdgeRow, event: boolean) => r.verdict === "맞음" && gold.find((c) => c.id === r.id)?.expected.event === event;
  return {
    rows,
    totals: {
      cases: rows.length,
      hit: rows.filter((r) => ok(r, true)).length,
      quietOk: rows.filter((r) => ok(r, false)).length,
      miss: rows.filter((r) => r.verdict === "놓침").length,
      falseAlarm: rows.filter((r) => r.verdict === "잘못 울림").length,
      outcomeWrong: rows.filter((r) => r.verdict === "결과 다름").length,
      failed: gold.filter((c) => !byId.has(c.id) || byId.get(c.id)?.error).length,
    },
    byKind: kindTotals(rows),
  };
}

/** 등급 사례 + 경계 사례. 등급 사례에는 "결과 다름"이 없다(등급 맞음은 따로 센다). */
export function overallTotals(grade: Totals, edge: EdgeTotals): EdgeTotals {
  return {
    cases: grade.cases + edge.cases, hit: grade.hit + edge.hit, quietOk: grade.quietOk + edge.quietOk,
    miss: grade.miss + edge.miss, falseAlarm: grade.falseAlarm + edge.falseAlarm, outcomeWrong: edge.outcomeWrong, failed: grade.failed + edge.failed,
  };
}

/** result.md 뒤에 붙는 경계 사례 절. 같은 점수면 같은 글. */
export function edgeMarkdown(s: EdgeScore): string {
  const t = s.totals;
  const lines = [
    "## 사건 종류·경계 사례 (eval/gold.json `edgeCases`)",
    "",
    `- 사건: 맞게 울림 ${t.hit} · 맞게 조용함 ${t.quietOk} · **놓침 ${t.miss}** · **잘못 울림 ${t.falseAlarm}** · **결과 다름 ${t.outcomeWrong}** (사례 ${t.cases}) · 실행 실패 ${t.failed}`,
    "- 결과 다름 = 사건 수는 맞지만 앱이 낸 결과가 정답과 다름(예: 수집 오류를 변화 없음으로 봄).",
    "",
    "| 종류 | 사례 | 맞음 | 놓침 | 잘못 울림 | 결과 다름 |",
    "|---|---|---|---|---|---|",
    ...EDGE_KINDS.map((k) => { const b = s.byKind[k]; return `| ${k} | ${b.cases} | ${b.right} | ${b.miss} | ${b.falseAlarm} | ${b.outcomeWrong} |`; }),
    "",
    "| 사례 | 종류 | 대상 | 출처 | 기대 결과 | 실제 결과 | 판정 | 비고 |",
    "|---|---|---|---|---|---|---|---|",
    ...s.rows.map((r) => `| ${r.id} | ${r.kind} | ${r.target} | ${r.source} | ${r.expectedOutcome} | ${r.actualOutcome} | ${r.verdict} | ${r.note} |`),
  ];
  return lines.join("\n") + "\n";
}
