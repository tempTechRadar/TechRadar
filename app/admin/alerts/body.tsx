// 알림과 처리 현황 본문(관리자 화면 문법). 거르기만 하고 판단 버튼은 없다(불변 1, ADR 0016). 페이지와 개발용 견본이 같이 쓴다.
import type { AdminAlert, AlertCounts } from "@/lib/admin/admin-summaries";
import { KIND_LABEL } from "@/lib/alerts/to-alert-view";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, when } from "../admin-shell";
import { AdminEmpty, AdminSection, AdminSummary } from "../admin-ui";

export const TITLE = "알림과 처리 현황";
const LEAD = "모든 회원의 알림과 판단 상태예요. 이 화면에서는 보기만 해요: 판단은 알림을 받은 본인만 할 수 있어요.";
const PROVES = "알림마다 누가 언제 판단했는지가 남고, 관리자도 남의 알림을 대신 판단하지 않는다는 것";
export const KINDS = ["security", "opportunity", "model_eol"] as const;
const DECISION_KO: Record<string, string> = { candidate: "적용 후보", hold: "보류" };
const TOOLBAR = { links: [{ href: "/admin/flow", label: "흐름 화면" }, { href: "/admin/simulator", label: "시뮬레이터" }] };

export type AlertsBodyProps = { counts: AlertCounts; rows: AdminAlert[]; filter: { status: string; kind: string; period: string }; error?: string | null };

export function AlertsBody({ counts, rows, filter, error }: AlertsBodyProps) {
  return (
    <AdminShell tab="alerts" title={TITLE} lead={LEAD} proves={PROVES} error={error} toolbar={TOOLBAR}>
      <AdminSummary label="전체 알림 건수" items={[
        { value: counts.total, label: "전체" }, { value: counts.pending, label: "판단 대기" }, { value: counts.done, label: "완료" },
        { value: counts.candidate, label: "적용 후보" }, { value: counts.hold, label: "보류" },
      ]} />
      <FilterForm>
        <Select name="status" label="상태" value={filter.status} options={[{ value: "", label: "모든 상태" }, { value: "pending", label: "판단 대기" }, { value: "done", label: "완료" }]} />
        <Select name="kind" label="종류" value={filter.kind} options={[{ value: "", label: "모든 종류" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k].label }))]} />
        <Select name="period" label="기간" value={filter.period} options={PERIOD_OPTIONS} />
      </FilterForm>
      <AdminSection id="alerts-list" title="알림 목록" desc={`${rows.length}건`}>
        {rows.length === 0 ? <AdminEmpty>조건에 맞는 알림이 없어요.</AdminEmpty> : (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>받은 시각</th><th>회원</th><th>종류</th><th>기술</th><th>상태</th><th>판단</th><th>처리한 사람·시각</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{when(a.createdAt)}</td>
                    <td>{a.member}</td>
                    <td><span className={`badge ${a.kind === "security" ? "danger" : "neutral"}`}>{KIND_LABEL[a.kind as keyof typeof KIND_LABEL]?.label ?? a.kind}</span></td>
                    <td>{a.techName} {a.isSimulated ? <span className="badge warning">가짜</span> : null}</td>
                    <td>{a.status === "pending" ? <span className="badge warning">판단 대기</span> : <span className="badge success">완료</span>}</td>
                    <td>{a.judgment ? DECISION_KO[a.judgment.decision] ?? a.judgment.decision : "—"}</td>
                    <td>{a.judgment ? `${a.judgment.judgedBy} · ${when(a.judgment.judgedAt)}` : "—"}</td>
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
