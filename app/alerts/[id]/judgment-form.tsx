"use client";

import { useActionState, useState } from "react";
import { appendReason, HOLD_REASON_CHIPS, holdReasonProblem, MIN_HOLD_REASON, NO_FIXED_VERSION_MESSAGE } from "@/lib/alerts/validate-judgment";
import { judge, type JudgeState } from "./actions";

// 판단하기 카드(와이어프레임 alerts.html). 저장하기 전에는 아무것도 바뀌지 않는다(PRD-F17).
export function JudgmentForm({ alertId, canCandidate, kind, candidateLabel }: { alertId: string; canCandidate: boolean; kind: string; candidateLabel: string }) {
  const [state, action, pending] = useActionState<JudgeState, FormData>(judge, { message: null });
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="card" aria-labelledby="judge-title">
      <h2 id="judge-title">판단하기</h2>
      <p className="muted">저장하기 전에는 아무것도 바뀌지 않아요.</p>
      <input type="hidden" name="alertId" value={alertId} />
      <label htmlFor="hold-reason">보류하는 이유 (보류할 때만, {MIN_HOLD_REASON}자 이상)</label>
      <textarea id="hold-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="hold-help" />
      <div className="reason-chips" role="group" aria-label="자주 쓰는 보류 이유">
        {HOLD_REASON_CHIPS[kind === "security" ? "security" : "other"].map((r) => (
          <button key={r} type="button" className="chip" onClick={() => setReason((now) => appendReason(now, r))}>{r}</button>
        ))}
      </div>
      <p id="hold-help" className="muted">이유가 {MIN_HOLD_REASON}자 미만이면 보류 버튼이 눌리지 않아요.</p>
      {!canCandidate && <p className="muted">{NO_FIXED_VERSION_MESSAGE}</p>}
      {state.message && <div className="notice notice-error" role="alert">{state.message}</div>}
      <div className="actions">
        <button type="submit" name="decision" value="candidate" className="btn btn-primary" disabled={pending || !canCandidate}>{candidateLabel}</button>
        <button type="submit" name="decision" value="hold" className="btn" disabled={pending || holdReasonProblem(reason) !== null}>보류</button>
      </div>
    </form>
  );
}
