"use client";

import { useActionState, useRef, useState } from "react";
import { BLUEPRINT_GATE } from "@/lib/blueprint/knowledge";
import { appendReason, HOLD_REASON_CHIPS, holdReasonProblem, MIN_HOLD_REASON, NO_FIXED_VERSION_MESSAGE } from "@/lib/alerts/validate-judgment";
import { judge, type JudgeState } from "./actions";

// 판단하기 카드(와이어프레임 alerts.html). 저장하기 전에는 아무것도 바뀌지 않는다(PRD-F17).
// 두 갈래를 먼저 보이고(P-12n R3-2), 보류 이유 칸은 [보류…]를 펼친 뒤에만. <details>라 스크립트 전 · 키보드 · 화면 읽기로도 펼쳐진다
export function JudgmentForm({ alertId, canCandidate, kind, candidateLabel }: { alertId: string; canCandidate: boolean; kind: string; candidateLabel: string }) {
  const [state, action, pending] = useActionState<JudgeState, FormData>(judge, { message: null, n: 0 });
  const [reason, setReason] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={action} className="card judge-card" aria-labelledby="judge-title">
      <h2 id="judge-title">판단하기</h2>
      <p className="muted">저장하기 전에는 아무것도 바뀌지 않아요. {BLUEPRINT_GATE}</p>
      <input type="hidden" name="alertId" value={alertId} />
      {!canCandidate && <p className="muted">{NO_FIXED_VERSION_MESSAGE}</p>}
      {/* key = 실패 횟수: 같은 문구라도 새로 붙어 다시 읽히고 등장이 한 번 돈다(P-12g C1) */}
      {state.message && <div key={state.n} className="notice notice-error" role="alert">{state.message}</div>}
      <div className="actions judge-actions">
        <button type="submit" name="decision" value="candidate" className="btn btn-primary" disabled={pending || !canCandidate}>{candidateLabel}</button>
        <details className="hold-box" onToggle={(e) => { if (e.currentTarget.open) box.current?.focus(); }}>
          <summary className="btn" style={{ minHeight: "var(--hit)" }}>보류…</summary>
          <label htmlFor="hold-reason">보류하는 이유 ({MIN_HOLD_REASON}자 이상)</label>
          <textarea ref={box} id="hold-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby="hold-help" />
          <div className="reason-chips" role="group" aria-label="자주 쓰는 보류 이유">
            {HOLD_REASON_CHIPS[kind === "security" ? "security" : "other"].map((r) => (
              <button key={r} type="button" className="chip" onClick={() => setReason((now) => appendReason(now, r))}>{r}</button>
            ))}
          </div>
          <p id="hold-help" className="muted">이유가 {MIN_HOLD_REASON}자 미만이면 보류 저장이 눌리지 않아요.</p>
          <button type="submit" name="decision" value="hold" className="btn" disabled={pending || holdReasonProblem(reason) !== null}>보류 저장</button>
        </details>
      </div>
    </form>
  );
}
