"use client";

import { useActionState } from "react";
import type { ScenarioCard as Card } from "@/lib/alerts/to-scenario-view";
import { Cell } from "./opportunity-cards";
import { requestScenario, type ScenarioState } from "./scenario-actions";

// 적용 시나리오 카드(IA-8, SPEC-4.2, 와이어프레임 docs/wireframes/scenario.html). 참고 자료라 판단 전후 언제든 만들 수 있다(ADR 0010).
// 카드가 없는 것(null)은 읽기 실패: "시나리오 없음"과 다르게 보인다.
export function ScenarioCard({ alertId, card }: { alertId: string; card: Card | null }) {
  const [state, action, pending] = useActionState<ScenarioState, FormData>(requestScenario, { message: null, tone: "info" });
  if (card === null) {
    return <div className="notice notice-error" role="alert"><strong>시나리오를 불러오지 못했어요.</strong> 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요.</div>;
  }
  const request = (label: string) => (
    <form action={action}>
      <input type="hidden" name="alertId" value={alertId} />
      <div className="actions"><button type="submit" className="btn" disabled={pending}>{pending ? "만드는 중이에요…" : label}</button></div>
    </form>
  );
  const message = state.message && (
    <div className={`notice ${state.tone === "error" ? "notice-error" : "notice-empty"}`} role={state.tone === "error" ? "alert" : "status"}>{state.message}</div>
  );

  if (card.state === "done") {
    return (
      <article className="card" aria-labelledby="scenario-title">
        <h2 id="scenario-title">적용 시나리오 <span className="badge badge-neutral">참고 자료</span></h2>
        <p className="muted">{card.createdAtLabel}에 만들었어요. 판단 전후 언제든 볼 수 있어요.</p>
        {card.comparison && (
          <>
            <h3>비교</h3>
            <p className="muted">대체 기술은 확정된 같은 역할 기술이에요. 값과 출처는 코드가 채워요(AI가 지어내지 않아요).</p>
            <table className="compare">
              <thead><tr><th scope="col">항목</th><th scope="col">{card.comparison.headers.mine}</th><th scope="col">{card.comparison.headers.theirs}</th></tr></thead>
              <tbody>
                {card.comparison.rows.map((row) => (
                  <tr key={row.item}><th scope="row">{row.item}</th><Cell label="사용 중인 항목" cell={row.mine} /><Cell label="대체" cell={row.theirs} /></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        <h3>적용 단계</h3>
        <ol>{card.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
        <h3>위험과 되돌리는 방법</h3>
        <ul>{card.risks.map((risk, i) => <li key={i}>{risk}</li>)}</ul>
        <h3>참고한 출처</h3>
        {card.sources.length === 0 ? <p className="muted">출처 찾지 못함</p> : (
          <ul>{card.sources.map((source) => (
            <li key={source.text}>{source.isLink ? <a className="source" href={source.text} target="_blank" rel="noopener noreferrer">{source.text}</a> : <span className="source muted">{source.text}</span>}</li>
          ))}</ul>
        )}
        <p className="muted">AI가 쓴 글이에요. 실제로 적용하기 전에 출처를 직접 확인하세요.</p>
      </article>
    );
  }
  if (card.state === "generating") {
    return <div className="notice notice-empty" role="status"><strong>적용 시나리오를 만드는 중이에요.</strong> 잠시 뒤에 이 화면을 다시 불러와 주세요.</div>;
  }
  if (card.state === "limit") {
    return <div className="notice notice-empty" role="status"><strong>오늘은 적용 시나리오를 5번 모두 만들었어요.</strong> 내일 0시(한국 시간)부터 다시 만들 수 있어요. 이미 만든 시나리오는 각 알림에서 볼 수 있어요.</div>;
  }
  if (card.state === "failed") {
    return (
      <>
        <div className="notice notice-error" role="alert"><strong>적용 시나리오를 만들지 못했어요.</strong> 알림과 판단은 그대로예요.{card.canRetry ? " 잠시 뒤에 다시 요청해 주세요." : " 오늘은 5번을 모두 썼어요. 내일 0시(한국 시간)부터 다시 만들 수 있어요."}</div>
        {card.canRetry && request("다시 요청")}
        {message}
      </>
    );
  }
  return (
    <article className="card" aria-labelledby="scenario-title">
      <h2 id="scenario-title">적용 시나리오</h2>
      <p className="muted">이 알림을 어떻게 적용할지 참고용으로 정리해 줘요. 설치나 적용은 하지 않고, 판단을 돕는 글만 만들어요. 누르면 하루 5번 중 한 번을 써요(오늘 남은 횟수 {card.remaining}번).</p>
      {message}
      {request("적용 시나리오 만들기")}
    </article>
  );
}
