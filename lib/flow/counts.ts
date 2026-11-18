// 화살표 위 건수(docs/flow.md 3절): 실제 run_steps의 count_out·branch_counts로만 정한다. 기록이 없으면 숫자를 쓰지 않는다(불변 6).
import type { Flow, StepDetail } from "./types.ts";

/** branch_counts 키(팀 표준, lib/server/first-read.ts와 같음) → 화면 이름 */
export const BRANCH_NAME: Record<string, string> = { event: "사건", no_change: "변화 없음", collect_error: "수집 오류", ok: "성공" };

/** 화살표가 어느 갈래인지: 받는 상자가 갈래 이름과 같으면 그 갈래, 사건 분기의 예 쪽은 event, 나머지는 ok */
export function branchKey(from: string, to: string): string {
  if (to === "collect_error" || to === "no_change") return to;
  if (from === "is_event") return "event";
  return "ok";
}

function sumBranches(rows: StepDetail[]): Record<string, number> | null {
  const withCounts = rows.filter((r) => r.branch_counts);
  if (withCounts.length === 0) return null;
  const total: Record<string, number> = {};
  for (const r of withCounts) for (const [k, v] of Object.entries(r.branch_counts!)) total[k] = (total[k] ?? 0) + (Number(v) || 0);
  return total;
}

function sumCountOut(rows: StepDetail[]): number | null {
  const known = rows.filter((r) => typeof r.count_out === "number");
  return known.length === 0 ? null : known.reduce((n, r) => n + (r.count_out as number), 0);
}

function label(from: string, to: string, byStep: Map<string, StepDetail[]>): string | null {
  const rows = byStep.get(from);
  if (!rows) return null;
  const key = branchKey(from, to);
  const branches = sumBranches(rows);
  if (branches && key in branches) return `${BRANCH_NAME[key] ?? key} ${branches[key]}`;
  if (!byStep.has(to)) return null; // 받는 상자에 기록이 없으면 그 길로 넘어간 것이 아니다
  if (to === "collect_error") {
    const failed = rows.filter((r) => r.status === "failed").length;
    return failed > 0 ? `실패 ${failed}` : null;
  }
  const out = sumCountOut(rows);
  return out === null ? null : `${out}건`;
}

/** 화살표("from>to")마다 위에 쓸 글자. 숫자를 알 수 없는 화살표는 빠진다. */
export function edgeLabels(flow: Flow, steps: StepDetail[]): Map<string, string> {
  const byStep = new Map<string, StepDetail[]>();
  for (const s of steps) byStep.set(s.step_name, [...(byStep.get(s.step_name) ?? []), s]);
  const labels = new Map<string, string>();
  for (const e of flow.edges) {
    const text = label(e.from, e.to, byStep);
    if (text !== null) labels.set(`${e.from}>${e.to}`, text);
  }
  return labels;
}
