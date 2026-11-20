"use client";
// 내 판단 줄(관심 · 적용 후보 · 보류, ADR 0028): 지도 사이드바와 기술 상세가 함께 쓴다. 저장은 부르는 쪽(onMark)이 한다.
// 같은 단추를 다시 누르면 지우고, 보류는 이유 5자 이상, 위험 등급은 적용 후보가 막힌다(ADR 0012, DB도 같은 규칙).
import Link from "next/link";
import { useState } from "react";
import type { Grade, Mark, MarkStatus } from "@/lib/map/build-map";
import { appendReason, HOLD_REASON_CHIPS } from "@/lib/alerts/validate-judgment";
import "./judge.css";

export const MARK_KO: Record<MarkStatus, string> = { interest: "관심", candidate: "적용 후보", hold: "보류" };
/** 저장 뒤 문구: 받침이 있으면 "으로"(관심으로), 없거나 ㄹ이면 "로"(적용 후보로 · 보류로) */
export function markedText(status: MarkStatus | null): string {
  if (!status) return "표시를 지웠어요.";
  const w = MARK_KO[status], code = w.charCodeAt(w.length - 1) - 0xac00, jong = code >= 0 && code < 11172 ? code % 28 : 0;
  return `${w}${jong === 0 || jong === 8 ? "로" : "으로"} 남겼어요.`;
}
export type OnMark = (status: MarkStatus | null, reason: string) => void;
type Props = { techId: string | null; grade: Grade; mark: Mark | null; login: boolean; busy: boolean; onMark: OnMark };

/** 저장에 성공해 표시가 바뀌면 부르는 쪽이 key를 바꿔 새로 그린다(보류 칸은 성공할 때까지 열려 있다) */
export function Judge({ techId, grade, mark, login, busy, onMark }: Props) {
  const [holding, setHolding] = useState(false);
  const [reason, setReason] = useState(mark?.reason ?? "");
  if (!login) return <p className="muted">로그인하면 관심 · 적용 후보 · 보류를 남길 수 있어요. <Link href="/login?next=/">로그인</Link></p>;
  if (!techId) return <p className="muted">이름만 넣은 기술이라 판단을 남길 수 없어요.</p>;
  const now = mark?.status ?? null, danger = grade === "danger";
  const pick = (s: MarkStatus) => (s === now ? onMark(null, "") : s === "hold" ? setHolding(true) : onMark(s, "")); // 같은 단추 다시 = 지우기
  return (
    <div className="map-judge">
      <div className="map-row" role="group" aria-label="내 판단">
        {(["interest", "candidate", "hold"] as const).map((s) => (
          <button key={s} type="button" className={`btn${now === s ? " btn-primary" : ""}`} aria-pressed={now === s} disabled={busy || (s === "candidate" && danger && now !== s)} onClick={() => pick(s)}>{MARK_KO[s]}</button>
        ))}
      </div>
      {danger ? <p className="muted">위험한 버전은 바로 적용 후보로 둘 수 없어요. 보안 경고 알림에서 고친 버전과 함께 판단해 주세요.</p> : null}
      {holding ? (
        <form className="map-hold" onSubmit={(e) => { e.preventDefault(); onMark("hold", reason); }}>
          <label>보류하는 이유(5자 이상) <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required minLength={5} autoFocus /></label>
          <div className="reason-chips" role="group" aria-label="자주 쓰는 보류 이유">
            {HOLD_REASON_CHIPS.other.map((r) => <button key={r} type="button" className="chip" onClick={() => setReason((now) => appendReason(now, r))}>{r}</button>)}
          </div>
          <div className="map-row"><button type="submit" className="btn btn-primary" disabled={busy}>보류로 저장</button><button type="button" className="btn" onClick={() => setHolding(false)}>취소</button></div>
        </form>
      ) : null}
      {now ? <p className="muted">지금: {MARK_KO[now]}{mark?.reason ? ` · ${mark.reason}` : ""}. 같은 단추를 다시 누르면 지워요.</p> : <p className="muted">판단 대기 알림이 있으면 그 알림도 함께 판단돼요.</p>}
    </div>
  );
}
