"use client";
// 기술 상세 머리의 판단 줄(design.md 18절 "기술 상세(머리 + 2단)"): 지도 사이드바와 같은 단추 · 같은 저장(markTech) · 같은 문구와 되돌리기.
// 실패하면 표시는 그대로 두고 이유를 보인다(불변 4). 함께 판단된 알림이 있으면 되돌릴 수 없다고 알린다.
import { useState } from "react";
import type { Grade, Mark, MarkStatus } from "@/lib/map/build-map";
import { markTech } from "../../../tech-map/actions";
import { Judge, markedText } from "../../../tech-map/judge";

const FAIL = { ok: false as const, message: "저장하지 못했어요. 다시 시도해 주세요." };

export function MarkBar({ techId, grade, initial }: { techId: string; grade: Grade; initial: Mark | null }) {
  const [mark, setMark] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [undo, setUndo] = useState<Mark | null | undefined>(undefined); // undefined = 되돌릴 것 없음
  async function save(status: MarkStatus | null, reason: string): Promise<boolean> {
    setBusy(true); setMsg(""); setUndo(undefined);
    const r = await markTech(techId, status, reason).catch(() => FAIL);
    setBusy(false);
    if (!r.ok) { setMsg(r.message); return false; }
    const before = mark;
    setMark(status ? { techId, status, reason: status === "hold" ? reason.trim() : null } : null);
    if (r.judgedAlerts.length) setMsg(`${markedText(status)} 판단 대기 알림 ${r.judgedAlerts.length}개도 함께 판단했어요(알림 판단은 되돌릴 수 없어요). 설치하거나 바꾼 것은 없어요.`);
    else { setMsg(`${markedText(status)} 설치하거나 바꾼 것은 없어요.`); setUndo(before); }
    return true;
  }
  async function back() {
    const prev = undo;
    if (prev === undefined) return;
    if (await save(prev?.status ?? null, prev?.reason ?? "")) { setMsg("되돌렸어요."); setUndo(undefined); }
  }
  return (
    <div className="td-judge">
      <Judge key={mark?.status ?? "none"} techId={techId} grade={grade} mark={mark} login busy={busy} onMark={(s, r) => void save(s, r)} />
      <p className="muted" role="status">{msg}{undo !== undefined ? <> <button type="button" className="btn" onClick={back} disabled={busy}>되돌리기</button></> : null}</p>
    </div>
  );
}
