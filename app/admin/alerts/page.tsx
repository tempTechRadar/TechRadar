// 알림과 처리 현황(IA-14, PRD-F27): 모든 회원의 알림, 판단 상태, 처리한 사람과 시각. 거르기만 하고 판단 버튼은 없다(불변 1, ADR 0016). 관리자만.
// 페이지는 관리자 확인 · 읽기만, 그림은 body.tsx(I-admin-unify).
import { periodStart, pickOne } from "@/lib/admin/admin-filter";
import { alertCounts, filterAlerts, type AdminAlert } from "@/lib/admin/admin-summaries";
import { readAlerts } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell } from "../admin-shell";
import { AlertsBody, KINDS, TITLE } from "./body";

type Search = Promise<{ status?: string; kind?: string; period?: string }>;
const STATUSES = ["pending", "done"] as const;

export default async function AdminAlertsPage({ searchParams }: { searchParams: Search }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="alerts" title={TITLE} blocked={gate.blocked} />;
  const sp = await searchParams;
  const f = { status: pickOne(sp.status, STATUSES), kind: pickOne(sp.kind, KINDS), from: periodStart(sp.period, new Date()) };
  let all: AdminAlert[] = [];
  let error: string | null = null;
  try { all = await readAlerts(gate.db); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const filter = { status: f.status ?? "", kind: f.kind ?? "", period: f.from ? String(sp.period) : "" };
  return <AlertsBody counts={alertCounts(all)} rows={filterAlerts(all, f)} filter={filter} error={error} />;
}
