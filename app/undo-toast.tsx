"use client";
// 공용 토스트(P-12f ④ c-toast): 저장 뒤 잠깐 뜨는 알림 + "되돌리기"(지도 · 청사진이 같이 씀). 되돌리기가 있으면 6초(누를 시간), 없으면 3.5초 뒤 사라진다.
// P-12g C4: 되돌리기 토스트는 시계가 하나 — 남은 시간 막대(CSS 6초)가 끝나면 닫힌다(JS 타이머 없음). 마우스를 올리거나 초점 · 누르고 있으면 막대와 함께 멈춘다(WCAG 2.2.1).
// 저장 실패(stay)는 다음 토스트가 올 때까지 남긴다(불변 4: 실패를 놓치지 않게). 토스트마다 id: 같은 글이 다시 와도 새로 붙어 다시 읽힌다.
import { useEffect, useRef, useState } from "react";
import type { MarkStatus } from "@/lib/map/build-map";
import { canUndoMark } from "@/lib/map/undo-mark";
import { markTech } from "./tech-map/actions";

type Toast = { id: number; text: string; undo?: () => void; stay?: boolean } | null;
/** stay = 저절로 사라지지 않음(저장 실패). 기존 호출(text, undo)은 그대로 */
export type Say = (text: string, undo?: () => void, stay?: boolean) => void;
const FAILED = { ok: false as const, message: "저장하지 못했어요. 다시 시도해 주세요." };

export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  const seq = useRef(0);
  // 되돌리기 토스트는 막대(onAnimationEnd)가, 실패 토스트는 다음 토스트가 닫는다. 나머지만 3.5초 타이머
  useEffect(() => { if (!toast || toast.undo || toast.stay) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);
  const say: Say = (text, undo, stay) => setToast({ id: ++seq.current, text, undo, stay });
  return { toast, say, clear: () => setToast(null) };
}

/** 늘 있는 알림 칸(비어 있으면 안 보임): 화면 읽기 프로그램이 바뀐 글을 읽어 준다. 모양은 .c-toast, className은 놓는 자리(c-toast-float = 화면 아래 가운데) */
export function ToastLine({ toast, clear, className }: { toast: Toast; clear: () => void; className: string }) {
  const hold = (on: boolean) => (e: React.PointerEvent<HTMLParagraphElement>) => { if (on) e.currentTarget.dataset.hold = ""; else delete e.currentTarget.dataset.hold; }; // 터치: 누르고 있는 동안 멈춤
  return (
    <p className={`c-toast ${className}`} role="status" aria-live="polite" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerCancel={hold(false)} onPointerLeave={hold(false)}>
      {toast ? <span key={`t${toast.id}`}>{toast.text}{toast.undo ? <span className="c-toast-note"> 되돌리기 단추는 6초 뒤 사라져요.</span> : null}</span> : null}
      {toast?.undo ? <button type="button" className="btn" onClick={() => { const u = toast.undo!; clear(); u(); }}>되돌리기</button> : null}
      {/* 남은 시간 막대 = 되돌리기 시계(6초 고정, 움직임 줄이기면 숨기고 위 글로). 막대 자신의 끝만 받는다 */}
      {toast?.undo ? <i key={`b${toast.id}`} className="c-toast-time" aria-hidden="true" onAnimationEnd={(e) => { if (e.target === e.currentTarget) clear(); }} /> : null}
    </p>
  );
}

type Prev = { status: MarkStatus; reason: string | null } | null;
/** 판단 표시 저장 + 결과 알림 + (되돌려도 알림이 판단되지 않을 때만) 되돌리기. 실패하면 false(화면은 전 상태 그대로, 불변 4) */
export async function saveMarkWithToast(m: { techId: string; status: MarkStatus | null; reason: string; prev: Prev; text: string; say: Say; onError?: (message: string) => void; onSaved: (restored: boolean) => void }): Promise<boolean> {
  const r = await markTech(m.techId, m.status, m.reason).catch(() => FAILED);
  if (!r.ok) { if (m.onError) m.onError(r.message); else m.say(r.message, undefined, true); return false; }
  m.onSaved(false);
  if (r.judgedAlerts.length) m.say(`${m.text} 판단 대기 알림 ${r.judgedAlerts.length}개도 함께 판단했어요(알림 판단은 되돌릴 수 없어요).`);
  else if (!canUndoMark(m.prev?.status ?? null)) m.say(m.text);
  else m.say(m.text, async () => {
    const back = await markTech(m.techId, m.prev?.status ?? null, m.prev?.reason ?? "").catch(() => FAILED);
    if (!back.ok) { m.say(back.message || "되돌리지 못했어요.", undefined, true); return; }
    m.onSaved(true);
    m.say("되돌렸어요.");
  });
  return true;
}
