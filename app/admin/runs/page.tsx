// 수집 실행과 오류(IA-15, PRD-F27): 실행 기록(언제, 무엇이, 몇 건, 성공 여부), 수집 오류와 연속 실패. "지금 한 번 실행"은 /admin/run-now(P-17)로 가는 링크. 관리자만.
// 페이지는 관리자 확인 · 읽기만, 그림은 body.tsx(I-admin-unify).
import type { RunRow, StepErrorRow } from "@/lib/admin/admin-summaries";
import { readRuns } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell } from "../admin-shell";
import { RunsBody, TITLE } from "./body";

export default async function RunsPage() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="runs" title={TITLE} blocked={gate.blocked} />;
  let runs: RunRow[] = [];
  let errors: StepErrorRow[] = [];
  let error: string | null = null;
  try { ({ runs, errors } = await readRuns(gate.db)); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  return <RunsBody runs={runs} errors={errors} error={error} />;
}
