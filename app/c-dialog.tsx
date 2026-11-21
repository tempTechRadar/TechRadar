"use client";
// 공용 대화상자(P-12f ④ c-dialog): 청사진 질문 · 확정, 손님 로그인 묻기, 관리자 숨기기가 같은 초점 · Esc · 화면 읽기로 움직인다. 모양은 app/page.css .c-dialog
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** 모달 껍데기: 그린 직후 showModal(초점 가두기 · Esc 닫기는 브라우저가) → 추천 보기(data-autofocus)로 초점, focusKey가 바뀌면(인터뷰 다음 질문) 다시.
 *  Esc · ✕는 onClose만 부르고 닫기는 사라질 때 한 번(정리에서 close → 연 단추로 초점). 브라우저 close 이벤트에 onClose를 걸지 않는다: 정리의 close가 다시 onClose를 불러 개발 모드 두 번 실행에서 바로 닫혔다.
 *  autoFocus는 닫힌 대화상자 안이라 먹지 않아 쓰지 않는다 */
export function Dialog({ title, onClose, focusKey, children }: { title: string; onClose: () => void; focusKey?: string | number; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const d = ref.current, opener = document.activeElement as HTMLElement | null;
    if (d && !d.open) d.showModal();
    // 먼저 닫는다: 열린 모달이 남은 채로는 바깥 단추에 초점이 가지 않는다(취소 · 고르기로 사라질 때 초점이 body로 빠지던 문제)
    return () => { if (d?.open) d.close(); if (opener && document.contains(opener)) opener.focus(); };
  }, []);
  useLayoutEffect(() => { ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); }, [focusKey]);
  return (
    <dialog ref={ref} className="c-dialog" aria-labelledby="c-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="c-dialog-head"><h2 id="c-dialog-title">{title}</h2><button type="button" className="btn" onClick={onClose} aria-label="닫기">✕</button></div>
      {children}
    </dialog>
  );
}

/** 예 · 취소 묻기(브라우저 기본 확인 창 대신). 첫 초점은 yes 단추 */
export function AskDialog({ title, yes, onYes, onClose, children }: { title: string; yes: string; onYes: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog title={title} onClose={onClose}>
      {children}
      <div className="c-dialog-row">
        <button type="button" className="btn btn-primary" data-autofocus="" onClick={onYes}>{yes}</button>
        <button type="button" className="btn" onClick={onClose}>취소</button>
      </div>
    </Dialog>
  );
}
