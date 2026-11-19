// 수집 실행과 오류(IA-15, PRD-F27): 실행 기록(언제, 무엇이, 몇 건, 성공 여부), 수집 오류와 연속 실패. "지금 한 번 실행"은 /admin/run-now(P-17)로 가는 링크. 관리자만.
import Link from "next/link";
import { errorKindCounts, failureStreaks, type RunRow, type StepErrorRow } from "@/lib/admin/admin-summaries";
import { ADMIN_READ_LIMIT, readRuns } from "@/lib/server/admin-queries";
import { adminGate } from "@/lib/server/admin-gate";
import { AdminShell, when } from "../admin-shell";

const TITLE = "수집 실행과 오류";
const LEAD = "언제 무엇이 돌았고 몇 건을 처리했는지, 실패가 몇 번 이어졌는지 보여 줘요. 수집 실패는 '변화 없음'이 아니라 '수집 오류'로 남아요.";
const TRIGGER_KO: Record<string, string> = { schedule: "예약", manual: "지금 실행", simulator: "시뮬레이터", user_reread: "다시 읽기", first_read: "처음 읽기", scoring: "채점" };
const STATUS_KO: Record<string, [string, string]> = { queued: ["대기", "neutral"], running: ["실행 중", "neutral"], succeeded: ["성공", "success"], failed: ["실패", "danger"], partial: ["일부 실패", "warning"] };
const ERROR_KO: Record<string, string> = { timeout: "시간 초과", network: "네트워크", rate_limited: "요청 한도", http_status: "상태 코드", parse: "읽기 실패" };

export default async function RunsPage() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="runs" title={TITLE} blocked={gate.blocked} />;
  let runs: RunRow[] = [];
  let errors: StepErrorRow[] = [];
  let error: string | null = null;
  try { ({ runs, errors } = await readRuns(gate.db)); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const streaks = failureStreaks(runs);
  const kinds = Object.entries(errorKindCounts(errors)).sort((a, b) => b[1] - a[1]);

  return (
    <AdminShell tab="runs" title={TITLE} lead={LEAD} error={error}>
      <p>
        <Link href="/admin/run-now" style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>지금 한 번 실행</Link>
        <span className="muted"> · 매일 06:00(한국 시간) 정기 실행 말고 지금 한 번 더 돌릴 때</span>
      </p>

      <h2>연속 실패</h2>
      {streaks.length === 0 ? <p>지금 이어지고 있는 실패는 없어요.</p> : (
        <ul>
          {streaks.map((s) => (
            <li key={s.trigger}>
              <span className="badge danger">{s.streak}번 연속</span> {TRIGGER_KO[s.trigger] ?? s.trigger} · 마지막 실패 {when(s.lastFailedAt)}
            </li>
          ))}
        </ul>
      )}

      <h2>수집 오류 종류</h2>
      {kinds.length === 0 ? <p>기록된 수집 오류가 없어요.</p> : (
        <ul className="admin-counts">
          {kinds.map(([k, n]) => <li key={k}><b>{n}</b><span>{ERROR_KO[k] ?? k}</span></li>)}
        </ul>
      )}
      {errors.length > 0 ? (
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
      ) : null}

      <h2>실행 기록</h2>
      <p className="muted">{runs.length}건{runs.length >= ADMIN_READ_LIMIT ? ` (최근 ${ADMIN_READ_LIMIT}건만 보여요)` : ""}</p>
      {runs.length === 0 ? <p>아직 실행 기록이 없어요.</p> : (
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
    </AdminShell>
  );
}
