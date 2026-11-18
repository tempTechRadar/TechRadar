"use client";

import { useActionState, useState } from "react";
import { NO_FIXED_VERSION_MESSAGE } from "@/lib/alerts/validate-judgment";
import { judge, type JudgeState } from "./actions";

const MIN_HOLD_REASON = 5;

// 판단하기 카드(와이어프레임 alerts.html). 저장하기 전에는 아무것도 바뀌지 않는다(PRD-F17).
export function JudgmentForm({ alertId, canCandidate }: { alertId: string; canCandidate: boolean }) {
  const [state, action, pending] = useActionState<JudgeState, FormData>(judge, { message: null });
  const [reason, setReason] = useState("");
  return (
    <form action={action} className="card" aria-labelledby="judge-title">
      <h2 id="judge-title">판단하기</h2>
      <p className="muted">저장하기 전에는 아무것도 바뀌지 않아요.</p>
      <input type="hidden" name="alertId" value={alertId} />
      <label htmlFor="hold-reason">보류하는 이유 (보류할 때만, {MIN_HOLD_REASON}자 이상)</label>
      <textarea id="hold-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="hold-help" />
      <p id="hold-help" className="muted">이유가 {MIN_HOLD_REASON}자 미만이면 보류 버튼이 눌리지 않아요.</p>
      {!canCandidate && <p className="muted">{NO_FIXED_VERSION_MESSAGE}</p>}
      {state.message && <div className="notice notice-error" role="alert">{state.message}</div>}
      <div className="actions">
        <button type="submit" name="decision" value="candidate" className="btn btn-primary" disabled={pending || !canCandidate}>적용 후보</button>
        <button type="submit" name="decision" value="hold" className="btn" disabled={pending || reason.trim().length < MIN_HOLD_REASON}>보류</button>
      </div>
    </form>
  );
}
