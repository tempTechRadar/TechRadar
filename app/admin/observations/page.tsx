// 수집 자료(IA-13, PRD-F27): 출처별로 모은 자료(시각, 대상, 지표, 이전 값·현재 값, 바뀐 정도, 출처). 출처·기간으로 거르기. 관리자만.
// 페이지는 관리자 확인 · 읽기만, 그림은 body.tsx(I-admin-unify).
import { periodStart, pickId } from "@/lib/admin/admin-filter";
import { readObservations, readSources, type AdminObservation } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell } from "../admin-shell";
import { ObservationsBody, TITLE } from "./body";

type Search = Promise<{ source?: string; period?: string }>;

export default async function ObservationsPage({ searchParams }: { searchParams: Search }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="observations" title={TITLE} blocked={gate.blocked} />;
  const sp = await searchParams;
  const filter = { sourceId: pickId(sp.source), from: periodStart(sp.period, new Date()) };
  let sources: { id: string; name: string }[] = [];
  let rows: AdminObservation[] = [];
  let error: string | null = null;
  try { [sources, rows] = await Promise.all([readSources(gate.db), readObservations(gate.db, filter)]); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  return <ObservationsBody rows={rows} sources={sources} filter={{ source: filter.sourceId ?? "", period: filter.from ? String(sp.period) : "" }} error={error} />;
}
