"use client";
// 새 기술 줄의 "관심" 단추: 누르면 관심으로 남기고, 이미 관심이면 지운다(지도 사이드바와 같은 저장). 실패하면 그대로 두고 이유를 보인다(불변 4).
import { useState } from "react";
import type { MarkStatus } from "@/lib/map/build-map";
import { markTech } from "../tech-map/actions";

const KO: Record<MarkStatus, string> = { interest: "관심", candidate: "적용 후보", hold: "보류" };

export function InterestButton({ techId, initial }: { techId: string; initial: MarkStatus | null }) {
  const [status, setStatus] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (status && status !== "interest") return <span className="muted">{KO[status]}로 남김</span>; // 더 진행한 판단은 여기서 되돌리지 않는다
  async function flip() {
    setBusy(true); setMsg("");
    const next = status === "interest" ? null : "interest";
    const r = await markTech(techId, next, "").catch(() => ({ ok: false as const, message: "저장하지 못했어요. 다시 시도해 주세요." }));
    setBusy(false);
    if (r.ok) setStatus(next); else setMsg(r.message);
  }
  return (
    <>
      <button type="button" className={`btn${status ? " btn-primary" : ""}`} aria-pressed={status === "interest"} disabled={busy} onClick={flip}>관심</button>
      {msg ? <span className="notice-error" role="alert">{msg}</span> : null}
    </>
  );
}
