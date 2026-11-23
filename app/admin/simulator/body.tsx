// 시뮬레이터 본문(관리자 화면 문법: 툴바 → 알림 → 섹션 "시연 동작" 안에 동작 칸 3개). 페이지와 개발용 견본(/dev/admin-sample/simulator)이 같이 쓴다. 역할 검사는 페이지가 한다.
import Link from "next/link";
import { clearSimulatedAction, runOpportunityAction, runSimulatorAction } from "./actions";
import { SubmitButton } from "../submit-button";
import { AdminShell } from "../admin-shell";
import { AdminSection, AdminTile, AdminTiles } from "../admin-ui";

export const TITLE = "시뮬레이터";
const LEAD = "진짜 취약점은 발표 시간에 맞춰 나오지 않아서, 가짜 변경 1건(npm mcp-remote 0.1.15, 위험)을 만들어 처음부터 끝까지 도는 걸 보여 줍니다.";
const PROVES = "수집 → 비교 → 알림 → 사람 판단 대기까지 한 바퀴가 실제 실행 기록으로 남는다는 것(같은 버튼을 또 눌러도 변경은 1건)";
const TOOLBAR = { links: [{ href: "/admin/flow", label: "흐름 화면" }, { href: "/admin/demo", label: "실패 시연과 채점" }, { href: "/admin/alerts", label: "알림과 처리 현황" }] };

export function SimulatorBody({ error, cleared, info, run }: { error?: string | null; cleared?: string | null; info?: string | null; run?: string }) {
  return (
    <AdminShell tab="simulator" title={TITLE} lead={LEAD} proves={PROVES} toolbar={TOOLBAR} notes={[
      error ? { tone: "danger", text: error } : null,
      cleared ? { tone: "info", text: cleared } : null,
      info ? { tone: "info", text: <>{info}{run ? <> <Link href={`/admin/flow?run=${encodeURIComponent(run)}`}>방금 실행 보기</Link></> : null}</> } : null,
    ]}>
      <AdminSection id="sim-actions" title="시연 동작"
        desc="가짜 표시(시뮬레이터)가 붙은 줄만 만들고 지워요 · 알림은 시연 계정에만 가요(그 계정이 이 기술을 쓰지 않으면 0건, 이유가 나와요) · 같은 버튼을 또 눌러도 변경은 1건 그대로예요.">
        <AdminTiles>
          <AdminTile id="sim-change" title="가짜 변경" desc={<p className="muted">가짜 취약점 1건을 만들어 시연 계정에 알림이 가는 데까지 돌려요.</p>}>
            <form action={runSimulatorAction}><SubmitButton label="가짜 변경 1건 만들기" className="primary" /></form>
          </AdminTile>
          <AdminTile id="sim-opp" title="적용 기회" desc={<p className="muted">시연 계정이 쓰는 기술과 같은 역할로 확정된 가짜 새 기술 1개를 넣어 &quot;적용 기회&quot; 알림까지 보여 줘요.</p>}>
            <form action={runOpportunityAction}><SubmitButton label="적용 기회 1건 만들기" /></form>
          </AdminTile>
          <AdminTile id="sim-clear" title="지우기" desc={<p className="muted">가짜 표시가 붙은 줄만 지우고, 실행 기록은 증거라 남겨요. 바꾼 기록(audit_logs)에 한 줄이 남아요. 발표 중간에는 누르지 마세요.</p>}>
            <form action={clearSimulatedAction}><SubmitButton label="시뮬레이터 지우기" className="danger" /></form>
          </AdminTile>
        </AdminTiles>
      </AdminSection>
    </AdminShell>
  );
}
