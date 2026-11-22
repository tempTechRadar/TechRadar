// 알림과 처리 현황(IA-14, PRD-F27): 모든 회원의 알림, 판단 상태, 처리한 사람과 시각. 거르기만 하고 판단 버튼은 없다(불변 1, ADR 0016). 관리자만.
import { periodStart, pickOne } from "@/lib/admin/admin-filter";
import { alertCounts, filterAlerts, type AdminAlert } from "@/lib/admin/admin-summaries";
import { KIND_LABEL } from "@/lib/alerts/to-alert-view";
import { readAlerts } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell, FilterForm, PERIOD_OPTIONS, Select, when } from "../admin-shell";

type Search = Promise<{ status?: string; kind?: string; period?: string }>;
const TITLE = "알림과 처리 현황";
const LEAD = "모든 회원의 알림과 판단 상태예요. 이 화면에서는 보기만 해요: 판단은 알림을 받은 본인만 할 수 있어요.";
const STATUSES = ["pending", "done"] as const;
const KINDS = ["security", "opportunity", "model_eol"] as const;
const DECISION_KO: Record<string, string> = { candidate: "적용 후보", hold: "보류" };

export default async function AdminAlertsPage({ searchParams }: { searchParams: Search }) {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="alerts" title={TITLE} blocked={gate.blocked} />;
  const sp = await searchParams;
  const f = { status: pickOne(sp.status, STATUSES), kind: pickOne(sp.kind, KINDS), from: periodStart(sp.period, new Date()) };
  let all: AdminAlert[] = [];
  let error: string | null = null;
  try { all = await readAlerts(gate.db); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const counts = alertCounts(all);
  const rows = filterAlerts(all, f);

  return (
    <AdminShell tab="alerts" title={TITLE} lead={LEAD} error={error}>
      <ul className="admin-counts" aria-label="전체 알림 건수">
        <li><b>{counts.total}</b><span>전체</span></li>
        <li><b>{counts.pending}</b><span>판단 대기</span></li>
        <li><b>{counts.done}</b><span>완료</span></li>
        <li><b>{counts.candidate}</b><span>적용 후보</span></li>
        <li><b>{counts.hold}</b><span>보류</span></li>
      </ul>
      <FilterForm>
        <Select name="status" label="상태" value={f.status ?? ""} options={[{ value: "", label: "모든 상태" }, { value: "pending", label: "판단 대기" }, { value: "done", label: "완료" }]} />
        <Select name="kind" label="종류" value={f.kind ?? ""} options={[{ value: "", label: "모든 종류" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k].label }))]} />
        <Select name="period" label="기간" value={f.from ? String(sp.period) : ""} options={PERIOD_OPTIONS} />
      </FilterForm>
      <p className="muted">{rows.length}건</p>
      {rows.length === 0 ? <p>조건에 맞는 알림이 없어요.</p> : (
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
    </AdminShell>
  );
}
