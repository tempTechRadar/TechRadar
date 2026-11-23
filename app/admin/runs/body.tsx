// 수집 실행과 오류 본문(관리자 화면 문법). 페이지(읽기 · 관리자 확인)와 개발용 견본이 같이 쓴다.
// 숫자 띠 = 수집 오류 종류별 건수(읽은 실행 기록에서 센 값), 섹션 = 연속 실패 · 수집 오류 · 실행 기록.
import Link from "next/link";
import { errorKindCounts, failureStreaks, type RunRow, type StepErrorRow } from "@/lib/admin/admin-summaries";
import { ADMIN_READ_LIMIT } from "@/lib/server/admin-queries";
import { AdminShell, when } from "../admin-shell";
import { AdminEmpty, AdminSection, AdminSummary } from "../admin-ui";

export const TITLE = "수집 실행과 오류";
const LEAD = "언제 무엇이 돌았고 몇 건을 처리했는지, 실패가 몇 번 이어졌는지 보여 줘요. 수집 실패는 '변화 없음'이 아니라 '수집 오류'로 남아요.";
const PROVES = "실패가 '변화 없음'으로 숨지 않고 수집 오류 · 연속 실패로 남는다는 것";
const TRIGGER_KO: Record<string, string> = { schedule: "예약", manual: "지금 실행", simulator: "시뮬레이터", user_reread: "다시 읽기", first_read: "처음 읽기", scoring: "채점" };
const STATUS_KO: Record<string, [string, string]> = { queued: ["대기", "neutral"], running: ["실행 중", "neutral"], succeeded: ["성공", "success"], failed: ["실패", "danger"], partial: ["일부 실패", "warning"] };
const ERROR_KO: Record<string, string> = { timeout: "시간 초과", network: "네트워크", rate_limited: "요청 한도", http_status: "상태 코드", parse: "읽기 실패" };

// 주 행동 = 지금 한 번 실행 화면으로 가는 링크(꺼진 단추 아님)
const TOOLBAR = {
  links: [{ href: "/admin/flow", label: "흐름 화면" }, { href: "/admin/observations", label: "수집 자료" }],
  primary: <Link href="/admin/run-now" className="admin-cta">지금 한 번 실행</Link>,
};

export function RunsBody({ runs, errors, error }: { runs: RunRow[]; errors: StepErrorRow[]; error?: string | null }) {
  const streaks = failureStreaks(runs);
  const kinds = Object.entries(errorKindCounts(errors)).sort((a, b) => b[1] - a[1]);
  return (
    <AdminShell tab="runs" title={TITLE} lead={LEAD} proves={PROVES} error={error} toolbar={TOOLBAR}>
      {kinds.length > 0 ? <AdminSummary label="수집 오류 종류별 건수" items={kinds.map(([k, n]) => ({ value: n, label: ERROR_KO[k] ?? k }))} /> : null}

      <AdminSection id="runs-streaks" title="연속 실패">
        {streaks.length === 0 ? <AdminEmpty>지금 이어지고 있는 실패는 없어요.</AdminEmpty> : (
          <ul className="admin-list">
            {streaks.map((s) => (
              <li key={s.trigger}>
                <span className="badge danger">{s.streak}번 연속</span> {TRIGGER_KO[s.trigger] ?? s.trigger} · 마지막 실패 {when(s.lastFailedAt)}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection id="runs-errors" title="수집 오류" desc={errors.length > 50 ? `최근 50건만 보여요(전체 ${errors.length}건)` : undefined}>
        {errors.length === 0 ? <AdminEmpty>기록된 수집 오류가 없어요.</AdminEmpty> : (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>시각</th><th>단계</th><th>오류 종류</th><th>내용</th></tr></thead>
              <tbody>
                {errors.slice(0, 50).map((s, i) => (
                  <tr key={`${s.run_id}-${s.step_name}-${i}`}>
                    <td>{when(s.created_at)}</td><td className="mono">{s.step_name}</td>
                    <td>{s.error_kind ? ERROR_KO[s.error_kind] ?? s.error_kind : <span className="muted">종류 없음</span>}</td>
                    <td className="mono">{s.error_message ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>

      <AdminSection id="runs-list" title="실행 기록" desc={`${runs.length}건${runs.length >= ADMIN_READ_LIMIT ? ` (최근 ${ADMIN_READ_LIMIT}건만 보여요)` : ""} · 매일 06:00(한국 시간) 정기 실행 말고 지금 한 번 더 돌릴 때는 위 '지금 한 번 실행'`}>
        {runs.length === 0 ? <AdminEmpty>아직 실행 기록이 없어요.</AdminEmpty> : (
          <div className="admin-table-wrap">
            <table>
              <thead><tr><th>시각</th><th>무엇이</th><th>결과</th><th>처리 건수</th><th>흐름</th></tr></thead>
              <tbody>
                {runs.map((r) => {
                  const [label, tone] = STATUS_KO[r.status] ?? [r.status, "neutral"];
                  return (
                    <tr key={r.id}>
                      <td>{when(r.created_at)}</td><td>{TRIGGER_KO[r.trigger] ?? r.trigger}</td>
                      <td><span className={`badge ${tone}`}>{label}</span></td><td>{r.item_count}</td>
                      <td><Link href={`/admin/flow?run=${encodeURIComponent(r.id)}`}>흐름 보기</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminSection>
    </AdminShell>
  );
}
