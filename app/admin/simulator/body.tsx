// 시뮬레이터 본문(관리자 틀 포함). 페이지와 개발용 견본(/dev/admin-sample/simulator)이 같이 쓴다. 역할 검사는 페이지가 한다.
import Link from "next/link";
import { clearSimulatedAction, runOpportunityAction, runSimulatorAction } from "./actions";
import { SubmitButton } from "../submit-button";
import { AdminShell } from "../admin-shell";

export const TITLE = "시뮬레이터";
const LEAD = "진짜 취약점은 발표 시간에 맞춰 나오지 않아서, 가짜 변경 1건(npm mcp-remote 0.1.15, 위험)을 만들어 처음부터 끝까지 도는 걸 보여 줍니다.";
const PROVES = "수집 → 비교 → 알림 → 사람 판단 대기까지 한 바퀴가 실제 실행 기록으로 남는다는 것(같은 버튼을 또 눌러도 변경은 1건)";

export function SimulatorBody({ error, cleared, info, run }: { error?: string | null; cleared?: string | null; info?: string | null; run?: string }) {
  return (
    <AdminShell tab="simulator" title={TITLE} lead={LEAD} proves={PROVES}>
      {/* 다른 관리자 화면(흐름 화면)과 같은 위쪽 링크 줄 */}
      <p className="admin-lead"><Link href="/admin/flow">흐름 화면</Link> · <Link href="/admin/demo">실패 시연과 채점</Link> · <Link href="/admin/alerts">알림과 처리 현황</Link></p>
      <p className="muted">가짜 표시(시뮬레이터)가 붙은 줄만 만들고 지워요 · 알림은 시연 계정에만 가요(그 계정이 이 기술을 쓰지 않으면 0건, 이유가 나와요) · 같은 버튼을 또 눌러도 변경은 1건 그대로예요.</p>
      {error ? <p role="alert" className="admin-note danger">{error}</p> : null}
      {cleared ? <p role="status" className="admin-note info">{cleared}</p> : null}
      {info ? <p role="status" className="admin-note info">{info}{run ? <> <Link href={`/admin/flow?run=${encodeURIComponent(run)}`}>방금 실행 보기</Link></> : null}</p> : null}

      {/* 동작 3개를 한 줄에 나란히(좁은 화면은 한 칸씩). 단추는 칸 아래에 줄 맞춤 */}
      <div className="admin-tiles">
        <section className="admin-tile" aria-labelledby="sim-change">
          <h2 id="sim-change">가짜 변경</h2>
          <p className="muted">가짜 취약점 1건을 만들어 시연 계정에 알림이 가는 데까지 돌려요.</p>
          <form action={runSimulatorAction}>
            <SubmitButton label="가짜 변경 1건 만들기" className="primary" />
          </form>
        </section>
        <section className="admin-tile" aria-labelledby="sim-opp">
          <h2 id="sim-opp">적용 기회</h2>
          <p className="muted">시연 계정이 쓰는 기술과 같은 역할로 확정된 가짜 새 기술 1개를 넣어 &quot;적용 기회&quot; 알림까지 보여 줘요.</p>
          <form action={runOpportunityAction}>
            <SubmitButton label="적용 기회 1건 만들기" />
          </form>
        </section>
        <section className="admin-tile" aria-labelledby="sim-clear">
          <h2 id="sim-clear">지우기</h2>
          <p className="muted">가짜 표시가 붙은 줄만 지우고, 실행 기록은 증거라 남겨요. 바꾼 기록(audit_logs)에 한 줄이 남아요. 발표 중간에는 누르지 마세요.</p>
          <form action={clearSimulatedAction}>
            <SubmitButton label="시뮬레이터 지우기" className="danger" />
          </form>
        </section>
      </div>
    </AdminShell>
  );
}
