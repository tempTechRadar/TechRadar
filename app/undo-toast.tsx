"use client";
// 공용 토스트(P-12f ④ c-toast): 저장 뒤 잠깐 뜨는 알림 + "되돌리기"(지도 · 청사진이 같이 씀). 되돌리기가 있으면 6초(누를 시간), 없으면 3.5초 뒤 사라진다
import { useEffect, useState } from "react";
import type { MarkStatus } from "@/lib/map/build-map";
import { canUndoMark } from "@/lib/map/undo-mark";
import { markTech } from "./tech-map/actions";

type Toast = { text: string; undo?: () => void } | null;
export type Say = (text: string, undo?: () => void) => void;
const FAILED = { ok: false as const, message: "저장하지 못했어요. 다시 시도해 주세요." };

export function useToast() {
  const [toast, setToast] = useState<Toast>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500); return () => clearTimeout(t); }, [toast]);
  const say: Say = (text, undo) => setToast({ text, undo });
  return { toast, say, clear: () => setToast(null) };
}

/** 늘 있는 알림 칸(비어 있으면 안 보임): 화면 읽기 프로그램이 바뀐 글을 읽어 준다. 모양은 .c-toast, className은 놓는 자리(c-toast-float = 화면 아래 가운데) */
export function ToastLine({ toast, clear, className }: { toast: Toast; clear: () => void; className: string }) {
  return <p className={`c-toast ${className}`} role="status" aria-live="polite">{toast?.text}{toast?.undo ? <button type="button" className="btn" onClick={() => { const u = toast.undo!; clear(); u(); }}>되돌리기</button> : null}</p>;
}

type Prev = { status: MarkStatus; reason: string | null } | null;
/** 판단 표시 저장 + 결과 알림 + (되돌려도 알림이 판단되지 않을 때만) 되돌리기. 실패하면 false(화면은 전 상태 그대로, 불변 4) */
export async function saveMarkWithToast(m: { techId: string; status: MarkStatus | null; reason: string; prev: Prev; text: string; say: Say; onError?: (message: string) => void; onSaved: (restored: boolean) => void }): Promise<boolean> {
  const r = await markTech(m.techId, m.status, m.reason).catch(() => FAILED);
  if (!r.ok) { (m.onError ?? m.say)(r.message); return false; }
  m.onSaved(false);
  if (r.judgedAlerts.length) m.say(`${m.text} 판단 대기 알림 ${r.judgedAlerts.length}개도 함께 판단했어요(알림 판단은 되돌릴 수 없어요).`);
  else if (!canUndoMark(m.prev?.status ?? null)) m.say(m.text);
  else m.say(m.text, async () => {
    const back = await markTech(m.techId, m.prev?.status ?? null, m.prev?.reason ?? "").catch(() => FAILED);
    if (!back.ok) { m.say(back.message || "되돌리지 못했어요."); return; }
    m.onSaved(true);
    m.say("되돌렸어요.");
  });
  return true;
}
