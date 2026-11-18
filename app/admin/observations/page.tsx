// 수집 자료(IA-13, PRD-F27): 출처별로 모은 자료(시각, 대상, 지표, 이전 값·현재 값, 바뀐 정도, 출처). 출처·기간으로 거르기. 관리자만.
import { periodStart, pickId } from "@/lib/admin/admin-filter";
import { ADMIN_READ_LIMIT, readObservations, readSources, type AdminObservation } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, brief, when } from "../admin-shell";

type Search = Promise<{ source?: string; period?: string }>;
const TITLE = "수집 자료";
const LEAD = "출처에서 모은 값이에요. 이전 값과 현재 값을 나란히 보여 줘요. 시뮬레이터가 만든 줄은 '가짜' 표시가 붙어요.";
const SIZE_KO: Record<string, string> = { large: "큼", small: "작음", none: "없음" };

export default async function ObservationsPage({ searchParams }: { searchParams: Search }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="observations" title={TITLE} blocked={gate.blocked} />;
  const sp = await searchParams;
  const filter = { sourceId: pickId(sp.source), from: periodStart(sp.period, new Date()) };
  let sources: { id: string; name: string }[] = [];
  let rows: AdminObservation[] = [];
  let error: string | null = null;
  try { [sources, rows] = await Promise.all([readSources(gate.db), readObservations(gate.db, filter)]); } catch (e) { error = e instanceof Error ? e.message : String(e); }

  return (
    <AdminShell tab="observations" title={TITLE} lead={LEAD} error={error}>
      <FilterForm>
        <Select name="source" label="출처" value={filter.sourceId ?? ""} options={[{ value: "", label: "모든 출처" }, ...sources.map((s) => ({ value: s.id, label: s.name }))]} />
        <Select name="period" label="기간" value={filter.from ? String(sp.period) : ""} options={PERIOD_OPTIONS} />
      </FilterForm>
      <p className="muted">{rows.length}건{rows.length >= ADMIN_READ_LIMIT ? ` (최근 ${ADMIN_READ_LIMIT}건만 보여요)` : ""}</p>
      {rows.length === 0 ? <p>조건에 맞는 수집 자료가 없어요.</p> : (
        <div className="admin-table-wrap">
          <table>
            <thead><tr><th>시각</th><th>대상</th><th>지표</th><th>이전 값</th><th>현재 값</th><th>바뀐 정도</th><th>출처</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.observedAt)}</td>
                  <td>{r.techName} {r.isSimulated ? <span className="badge warning">가짜</span> : null}</td>
                  <td className="mono">{r.metric}</td>
                  <td className="mono">{brief(r.prevValue)}</td>
                  <td className="mono">{brief(r.currValue)}</td>
                  <td>{r.changeSize ? SIZE_KO[r.changeSize] ?? r.changeSize : "—"}</td>
                  <td>{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
