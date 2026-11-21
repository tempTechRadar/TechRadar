// 경계 사례 채점(PRD-F30): 사건 종류(보안 경고·적용 기회)와 경계(변화 없음·수집 실패·거절·보류·두 번 입력·조치·저장 실패)를 맞음·놓침·잘못 울림으로 센다.
// 등급 사례(score.ts)와 따로 센다: 등급 사례의 수와 표는 그대로 두고, 전체 수만 더한다. DB·파일을 모르는 순수 함수.
import type { EdgeInput } from "./edge.ts";
import type { Totals, Verdict } from "./score.ts";

export const EDGE_KINDS = ["보안 경고", "적용 기회", "변화 없음", "수집 실패", "거절·보류", "두 번 입력", "조치·저장 실패"] as const;
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
  expectedOutcome: string; expectedEvent: boolean; actualOutcome: string; verdict: EdgeVerdict; note: string;
};
export type EdgeTotals = { cases: number; hit: number; quietOk: number; miss: number; falseAlarm: number; outcomeWrong: number; failed: number };
export type KindTotals = { cases: number; right: number; miss: number; falseAlarm: number; outcomeWrong: number };
export type EdgeScore = { rows: EdgeRow[]; totals: EdgeTotals; byKind: Record<EdgeKind, KindTotals> };

export function edgeVerdictOf(expected: EdgeCase["expected"], actual: Pick<EdgeActual, "outcome" | "event">): EdgeVerdict {
  if (expected.event && !actual.event) return "놓침";
  if (!expected.event && actual.event) return "잘못 울림";
  return expected.outcome === actual.outcome ? "맞음" : "결과 다름";
}

const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** 정답 사례의 형식 검사. 틀리면 이유(첫 번째 하나), 맞으면 null. 정답 파일은 사람이 손으로 고치므로 채점 전에 본다. */
export function edgeCaseProblem(c: EdgeCase): string | null {
  const x = c as Partial<Record<keyof EdgeCase, unknown>> & { expected?: { outcome?: unknown; event?: unknown } };
  if (!isText(x.id)) return "id가 없음";
  if (!EDGE_KINDS.includes(x.kind as EdgeKind)) return `종류가 ${EDGE_KINDS.join("·")} 중 하나가 아님(${String(x.kind)})`;
  if (!isText(x.source)) return "출처(source)가 없음";
  if (typeof x.input !== "object" || x.input === null) return "input이 없음";
  if (!isText(x.expected?.outcome)) return "expected.outcome이 없음";
  if (typeof x.expected?.event !== "boolean") return "expected.event가 참·거짓이 아님";
  return null;
}

function rowOf(c: EdgeCase, a: EdgeActual | undefined): EdgeRow {
  const problem = edgeCaseProblem(c);
  const actual: EdgeActual = problem ? { id: c.id, outcome: "없음", event: false, error: `정답 형식 오류: ${problem}` } : a ?? { id: c.id, outcome: "없음", event: false, error: "실제 결과 없음" };
  const note = [actual.error && !problem ? `실행 실패: ${actual.error}` : actual.error ?? "", actual.note ?? ""].filter(Boolean).join(" · ");
  const expected = { outcome: String(c.expected?.outcome ?? ""), event: c.expected?.event === true };
  return {
    id: c.id, kind: c.kind, target: c.target, source: c.source,
    expectedOutcome: expected.outcome, expectedEvent: expected.event, actualOutcome: actual.outcome,
    // 형식 오류는 사건이 맞아 보여도 맞음으로 세지 않는다
    verdict: problem && edgeVerdictOf(expected, actual) === "맞음" ? "결과 다름" : edgeVerdictOf(expected, actual), note,
  };
}

function kindTotals(rows: EdgeRow[]): Record<EdgeKind, KindTotals> {
  const out = Object.fromEntries(EDGE_KINDS.map((k) => [k, { cases: 0, right: 0, miss: 0, falseAlarm: 0, outcomeWrong: 0 }])) as Record<EdgeKind, KindTotals>;
  const field = { 맞음: "right", 놓침: "miss", "잘못 울림": "falseAlarm", "결과 다름": "outcomeWrong" } as const;
  for (const r of rows) {
    if (!(r.kind in out)) continue; // 모르는 종류는 종류별 표에는 없고 전체 수·실행 실패에만 든다
    out[r.kind].cases++;
    out[r.kind][field[r.verdict]]++;
  }
  return out;
}

function assertUniqueIds(gold: EdgeCase[]): void {
  const seen = new Set<string>();
  const dup = gold.map((c) => c.id).filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  if (dup.length) throw new Error(`정답 파일 경계 사례 id가 겹침: ${[...new Set(dup)].join(", ")} (id마다 한 줄이어야 채점이 섞이지 않음)`);
}

/** 정답 순서대로 한 줄씩. 실제 결과가 빠졌거나 정답 형식이 틀린 사례는 숨기지 않고 실행 실패로 센다. id가 겹치면 던진다. */
export function scoreEdges(gold: EdgeCase[], actuals: EdgeActual[]): EdgeScore {
  assertUniqueIds(gold);
  const byId = new Map(actuals.map((a) => [a.id, a]));
  const rows = gold.map((c) => rowOf(c, byId.get(c.id)));
  const ok = (r: EdgeRow, event: boolean) => r.verdict === "맞음" && r.expectedEvent === event;
  return {
    rows,
    totals: {
      cases: rows.length,
      hit: rows.filter((r) => ok(r, true)).length,
      quietOk: rows.filter((r) => ok(r, false)).length,
      miss: rows.filter((r) => r.verdict === "놓침").length,
      falseAlarm: rows.filter((r) => r.verdict === "잘못 울림").length,
      outcomeWrong: rows.filter((r) => r.verdict === "결과 다름").length,
      failed: gold.filter((c) => edgeCaseProblem(c) || !byId.has(c.id) || byId.get(c.id)?.error).length,
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

/** 표 칸: | 는 \| 로, 줄바꿈은 빈칸으로(정답 파일의 글이 표를 깨지 않게) */
const cell = (v: unknown) => String(v ?? "").replace(/\r?\n/g, " ").replaceAll("|", "\\|");

/** result.md 뒤에 붙는 경계 사례 절. 같은 점수면 같은 글. */
export function edgeMarkdown(s: EdgeScore): string {
  const t = s.totals;
  const lines = [
    "## 사건 종류·경계 사례 (eval/gold.json `edgeCases`)",
    "",
    `- 사건: 맞게 울림 ${t.hit} · 맞게 조용함 ${t.quietOk} · **놓침 ${t.miss}** · **잘못 울림 ${t.falseAlarm}** · **결과 다름 ${t.outcomeWrong}** (사례 ${t.cases}) · 실행 실패 ${t.failed}`,
    "- 결과 다름 = 사건 수는 맞지만 앱이 낸 결과가 정답과 다름(예: 수집 오류를 변화 없음으로 봄).",
    "- 진짜 함수: queryOsv·gradeFromOsv·causeIdsOf·isChanged·planDanger·changeKey·decideAlerts·decideOpportunityAlerts·validateJudgment·saveJudgment(저장 실패는 시연 스위치의 failingRpc를 끼움).",
    "- 손으로 따라 쓴 수집기 분기(DB에 묶여 부를 수 없음, lib/eval/edge.ts): checkOne(오류 → 수집 오류)·gradeOf(등급 읽기 실패 → parse)·applyResult(위험 아니면 비교)·readLatestChange(원인·별칭이 같은 변경의 가장 큰 회차)·saveGrade(위험 아님 시각)·createSecurityAlerts(이미 있는 알림 키). 이 순서가 수집기와 어긋나면 채점이 못 잡는다.",
    "- 판단 저장 실패(조치·저장 실패)는 앱 쪽만 본다: 진짜 saveJudgment가 실패를 돌려주는지, 흐름의 조치 상자가 실패로 칠해지는지(actionOutcomeOf), 메모리 속 알림 한 줄이 그대로인지.",
    "- 채점 밖(DB가 있어야 함): save_judgment 한 거래 안의 되돌림(DB 함수 자체)·저장은 됐는데 응답이 끊긴 경우, changes.dedupe_key·alerts(user_id, dedupe_key) 유일 제약, 수집기 전체 흐름(runBatch·실행 기록).",
    "",
    "| 종류 | 사례 | 맞음 | 놓침 | 잘못 울림 | 결과 다름 |",
    "|---|---|---|---|---|---|",
    ...EDGE_KINDS.map((k) => { const b = s.byKind[k]; return `| ${k} | ${b.cases} | ${b.right} | ${b.miss} | ${b.falseAlarm} | ${b.outcomeWrong} |`; }),
    "",
    "| 사례 | 종류 | 대상 | 출처 | 기대 결과 | 실제 결과 | 판정 | 비고 |",
    "|---|---|---|---|---|---|---|---|",
    ...s.rows.map((r) => `| ${[r.id, r.kind, r.target, r.source, r.expectedOutcome, r.actualOutcome, r.verdict, r.note].map(cell).join(" | ")} |`),
  ];
  return lines.join("\n") + "\n";
}
