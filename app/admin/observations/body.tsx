// 수집 자료 본문(관리자 화면 문법). 페이지(읽기 · 관리자 확인)와 개발용 견본이 같이 쓴다.
import { ADMIN_READ_LIMIT, type AdminObservation } from "@/lib/server/admin-queries";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, brief, when } from "../admin-shell";
import { AdminEmpty, AdminSection } from "../admin-ui";

export const TITLE = "수집 자료";
const LEAD = "출처에서 모은 값이에요. 이전 값과 현재 값을 나란히 보여 줘요. 시뮬레이터가 만든 줄은 '가짜' 표시가 붙어요.";
const PROVES = "알림의 근거가 된 값이 이전 값 · 현재 값 그대로 남고, 시뮬레이터가 만든 줄은 가짜로 구분된다는 것";
const SIZE_KO: Record<string, string> = { large: "큼", small: "작음", none: "없음" };
const TOOLBAR = { links: [{ href: "/admin/runs", label: "수집 실행과 오류" }, { href: "/admin/flow", label: "흐름 화면" }] };

export type ObservationsBodyProps = { rows: AdminObservation[]; sources: { id: string; name: string }[]; filter: { source: string; period: string }; error?: string | null };

export function ObservationsBody({ rows, sources, filter, error }: ObservationsBodyProps) {
  const desc = `${rows.length}건${rows.length >= ADMIN_READ_LIMIT ? ` (최근 ${ADMIN_READ_LIMIT}건만 보여요)` : ""}`;
  return (
    <AdminShell tab="observations" title={TITLE} lead={LEAD} proves={PROVES} error={error} toolbar={TOOLBAR}>
      <FilterForm>
        <Select name="source" label="출처" value={filter.source} options={[{ value: "", label: "모든 출처" }, ...sources.map((s) => ({ value: s.id, label: s.name }))]} />
        <Select name="period" label="기간" value={filter.period} options={PERIOD_OPTIONS} />
      </FilterForm>
      <AdminSection id="obs-list" title="모은 값" desc={desc}>
        {rows.length === 0 ? <AdminEmpty>조건에 맞는 수집 자료가 없어요.</AdminEmpty> : (
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
      </AdminSection>
    </AdminShell>
  );
}
