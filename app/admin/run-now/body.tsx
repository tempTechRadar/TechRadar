// 지금 한 번 실행 본문(관리자 화면 문법). 페이지(역할 확인 · 읽기)와 개발용 견본이 같이 쓴다.
// 주 행동(툴바 오른쪽) = 실행 단추. 끝나면 서버 동작이 그 실행 id로 흐름 화면에 보낸다(actions.ts).
import Link from "next/link";
import { HIGHLIGHT_AFTER } from "@/lib/schedule/retry";
import { SubmitButton } from "../submit-button";
import { AdminShell, when } from "../admin-shell";
import { AdminEmpty, AdminSection } from "../admin-ui";
import { runNowAction } from "./actions";

export const TITLE = "지금 한 번 실행";
const LEAD = "매일 06:00(한국 시간)에 저절로 도는 수집을 지금 한 번 돌려요. 출처 하나가 실패해도 나머지는 계속하고, 실패는 \"수집 오류\"로 남아요.";
const PROVES = "정기 실행과 같은 수집이 사람이 누를 때도 같은 기록(실행 · 단계 · 수집 오류)을 남긴다는 것";
const STATUS_KO: Record<string, string> = { queued: "대기", running: "실행 중", succeeded: "성공", failed: "실패", partial: "일부 실패" };

export type LastRun = { id: string; status: string; created_at: string };
/** last: null = 읽었는데 없음, undefined = 읽지 않음(DB 연결 전 · 읽기 실패) — "없음"으로 말하지 않는다(불변 2) */
export type RunNowBodyProps = { sources: string[]; highlight: string[]; last: LastRun | null | undefined; readError?: string | null; error?: string; info?: string };

export function RunNowBody({ sources, highlight, last, readError, error, info }: RunNowBodyProps) {
  const toolbar = {
    links: [{ href: "/admin/flow", label: "흐름 화면" }, { href: "/admin/runs", label: "수집 실행과 오류" }],
    primary: <form action={runNowAction}><SubmitButton label="지금 한 번 실행" pendingNote="최대 4분" className="primary" /></form>,
  };
  return (
    <AdminShell tab="run-now" title={TITLE} lead={LEAD} proves={PROVES} toolbar={toolbar} notes={[
      error ? { tone: "danger", text: error } : null,
      info ? { tone: "info", text: info } : null,
      readError ? { tone: "danger", text: `최근 기록을 불러오지 못했어요(없는 게 아니에요): ${readError}` } : null,
      highlight.length > 0 ? { tone: "danger", text: `${HIGHLIGHT_AFTER}번 연속 수집 오류: ${highlight.join(", ")}` } : null,
    ]}>
      <AdminSection id="runnow-last" title="가장 최근 지금 실행" desc="위 단추를 누르면 끝난 뒤 그 실행의 흐름 화면으로 넘어가요.">
        {last ? (
          <p className="admin-inline-form">
            <Link className="admin-linkbtn" href={`/admin/flow?run=${encodeURIComponent(last.id)}`}>가장 최근 지금 실행 흐름 보기</Link>
            <span className="muted">{when(last.created_at)} · {STATUS_KO[last.status] ?? last.status}</span>
          </p>
        ) : last === null && !readError ? <AdminEmpty>아직 지금 실행 기록이 없어요.</AdminEmpty> : null}
      </AdminSection>
      <AdminSection id="runnow-sources" title={`등록된 수집기 (${sources.length}개)`}
        desc="실패하면 다음 시도 시각(2분 뒤)을 실행 기록에 적기만 해요. 자동으로 다시 돌지는 않아요. 무료 플랜 예약은 하루 한 번이라 다시 돌리려면 이 버튼을 눌러요.">
        {sources.length === 0 ? <AdminEmpty>아직 없어요. 수집 확장(P-9)이 합쳐지면 생겨요. 지금 누르면 실행 기록을 만들지 않고 이유만 알려 줘요.</AdminEmpty>
          : <ul className="admin-list">{sources.map((s) => <li key={s} className="mono">{s}</li>)}</ul>}
      </AdminSection>
    </AdminShell>
  );
}
