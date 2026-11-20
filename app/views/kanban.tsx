"use client";
// 내 레이더 칸반(ADR 0028, design.md 13절 4): 관심 → 적용 후보 → 쓰는 중, 보류. 옮기기는 칸 고르기로(끌어 놓기는 키보드로 못 써서 쓰지 않음).
// 옮기면 지도 사이드바와 같은 저장(markTech, 판단 대기 알림이 있으면 함께 판단). 실패하면 그대로 두고 이유를 보인다(불변 4).
// 옮긴 뒤 알림 + "되돌리기"(지도와 같은 saveMarkWithToast: 다시 저장해도 알림이 판단되지 않는 관심 · 표시 없음에서 옮겼을 때만)
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MarkStatus } from "@/lib/map/build-map";
import { COLUMN_KO, COLUMN_ORDER, type Card, type Column } from "@/lib/views/kanban";
import { saveMarkWithToast, ToastLine, useToast, type Say } from "../undo-toast";

const GRADE_TAG: Record<Card["grade"], string | null> = { danger: "✕ 위험", caution: "! 주의", pass: null, unknown: null };
const MOVES: (MarkStatus | "none")[] = ["interest", "candidate", "hold", "none"]; // none = 표시 지우기

function Move({ card, column, say }: { card: Card; column: Column; say: Say }) {
  const router = useRouter();
  const [to, setTo] = useState<"hold" | null>(null);
  const [reason, setReason] = useState(card.note ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!card.techId) return null; // 이름만 넣은 기술은 판단을 남길 수 없다
  async function save(status: MarkStatus | "none") {
    setBusy(true); setMsg("");
    const next = status === "none" ? null : status;
    // 알림에서 판단한 카드는 표시가 아니라 알림 판단이라 전 상태 = 표시 없음
    const prev = card.from === "alert" ? null : { status: column as MarkStatus, reason: card.note };
    const ok = await saveMarkWithToast({ techId: card.techId!, status: next, reason: status === "hold" ? reason : "", prev, say, onError: setMsg,
      text: `${card.name} → ${next ? COLUMN_KO[next] : "표시 지움"}.`, onSaved: () => router.refresh() });
    setBusy(false);
    if (ok) setTo(null);
  }
  return (
    <div className="kb-move">
      <label>옮기기 <select value={to ?? "-"} disabled={busy} onChange={(e) => {
        const v = e.target.value as MarkStatus | "none" | "-";
        if (v === "-") return;
        if (v === "hold") setTo("hold"); else void save(v);
      }}>
        <option value="-">고르기</option>
        {/* 알림 판단은 덧붙이기만이라 지울 수 없다 */}
        {MOVES.filter((m) => m !== column && !(m === "none" && card.from === "alert")).map((m) => <option key={m} value={m}>{m === "none" ? "표시 지우기" : COLUMN_KO[m]}</option>)}
      </select></label>
      {to === "hold" ? (
        <form onSubmit={(e) => { e.preventDefault(); void save("hold"); }}>
          <label>보류하는 이유(5자 이상) <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} required /></label>
          <button type="submit" className="btn btn-primary" disabled={busy}>보류로 저장</button> <button type="button" className="btn" onClick={() => setTo(null)}>취소</button>
        </form>
      ) : null}
      {msg ? <p className="notice notice-error" role="alert">{msg}</p> : null}
    </div>
  );
}

export function Kanban({ columns }: { columns: Record<Column, Card[]> }) {
  const { toast, say, clear } = useToast();
  return (
    <>
    <ToastLine toast={toast} clear={clear} className="kb-toast" />
    <div className="kanban">
      {COLUMN_ORDER.map((c) => (
        <section key={c} className="kb-col" aria-labelledby={`kb-${c}`}>
          <h2 id={`kb-${c}`}>{COLUMN_KO[c]} <span className="muted">{columns[c].length}</span></h2>
          {c === "using" ? <p className="muted">저장소에서 읽은 내 기술이에요. 옮기려면 프로젝트에서 빼거나 숨겨요.</p> : null}
          {columns[c].length ? (
            <ul>{columns[c].map((card) => (
              <li key={card.key} className="kb-card">
                <b>{card.name}</b>{GRADE_TAG[card.grade] ? <span className={`badge ${card.grade === "danger" ? "badge-danger" : "badge-warning"}`}>{GRADE_TAG[card.grade]}</span> : null}
                {card.note ? <span className="muted">{c === "hold" ? `이유: ${card.note}` : card.note}</span> : null}
                {card.from === "alert" ? <span className="muted">알림에서 판단함</span> : null}
                <span className="kb-links">
                  {card.myTechId ? <Link href={`/projects/tech/${card.myTechId}`}>기술 상세</Link> : card.techId ? <Link href={`/tech/${card.techId}`}>기술 상세</Link> : null}
                  {card.techId ? <Link href={`/?sel=${encodeURIComponent(`tech:${card.techId}`)}`}>지도에서 보기</Link> : null}
                </span>
                {c === "using" ? null : <Move card={card} column={c} say={say} />}
              </li>
            ))}</ul>
          ) : <p className="muted">{c === "interest" ? "지도나 새 기술에서 관심을 누르면 여기에 와요." : "없어요."}</p>}
        </section>
      ))}
    </div>
    </>
  );
}
