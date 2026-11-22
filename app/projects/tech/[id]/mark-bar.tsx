"use client";
// 기술 상세 판단 줄(P-12h-detail-marks, 지도 사이드 패널과 같은 모양): 이름 옆 별 = 관심, 머리 아래 "청사진에 담기 / 담김 ✓ · 빼기 · 청사진 열기". 보류 단추는 없다(알림 판단에만).
// 지도와 같은 부품(Star · Cart) · 같은 저장 · 문구 · 되돌리기(saveMarkWithToast, canUndoMark). 별과 담기가 한 표시를 함께 쓰려고 MarkScope가 상세 전체를 감싼다.
// 실패하면 표시는 그대로 두고 토스트가 남는다(불변 4).
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Grade, Mark, MarkStatus } from "@/lib/map/build-map";
import { cartChanged } from "@/lib/blueprint/cart-event";
import { saveMarkWithToast, ToastLine, useToast } from "../../../undo-toast";
import { Cart, Star } from "../../../tech-map/guest-pick";

type Scope = { techId: string; danger: boolean; mark: Mark | null; busy: boolean; onMark: (status: MarkStatus | null, text: string) => void };
const MarkCtx = createContext<Scope | null>(null);

export function MarkScope({ techId, grade, initial, children }: { techId: string; grade: Grade; initial: Mark | null; children: ReactNode }) {
  const [mark, setMark] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { toast, say, clear } = useToast();
  async function onMark(status: MarkStatus | null, text: string) {
    const prev = mark;
    setBusy(true);
    await saveMarkWithToast({ techId, status, reason: "", prev, text, say,
      onSaved: (restored) => {
        setMark(restored ? prev : status ? { techId, status, reason: null } : null);
        if (prev?.status === "candidate" || status === "candidate") cartChanged(); // 메뉴 "청사진" 담은 수 다시 세기
      } });
    setBusy(false);
  }
  return (
    <MarkCtx.Provider value={{ techId, danger: grade === "danger", mark, busy, onMark }}>
      {children}
      <ToastLine toast={toast} clear={clear} className="c-toast-float" />
    </MarkCtx.Provider>
  );
}

export function MarkStar() {
  const c = useContext(MarkCtx);
  return c ? <Star status={c.mark?.status} busy={c.busy} onMark={c.onMark} /> : null;
}

export function MarkBar() {
  const c = useContext(MarkCtx);
  return c ? <div className="td-judge"><Cart techId={c.techId} mark={c.mark} danger={c.danger} login busy={c.busy} onMark={c.onMark} /></div> : null;
}
