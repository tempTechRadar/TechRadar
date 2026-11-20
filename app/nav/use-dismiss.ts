"use client";
// 메뉴 펼침(<details>)을 닫는 규칙 한 곳: 바깥을 누르거나, 포커스가 떠나거나, 펼침 안에서 Esc.
// Esc는 펼침이 열려 있고 포커스가 안에 있을 때만 여기서 끝낸다(같은 키로 지도 사이드바까지 닫히지 않게: 캡처 단계에서 멈춤)
import { useEffect, type RefObject } from "react";

export function useDismiss(box: RefObject<HTMLDetailsElement | null>, on = true) {
  useEffect(() => {
    const d = box.current;
    if (!d || !on) return;
    const outside = (e: MouseEvent) => { if (d.open && !d.contains(e.target as Node)) d.open = false; };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !d.open || !d.contains(document.activeElement)) return;
      e.stopPropagation();
      d.open = false;
      d.querySelector("summary")?.focus();
    };
    const left = (e: FocusEvent) => { if (d.open && !d.contains(e.relatedTarget as Node | null)) d.open = false; };
    document.addEventListener("click", outside);
    document.addEventListener("keydown", esc, true);
    d.addEventListener("focusout", left);
    return () => { document.removeEventListener("click", outside); document.removeEventListener("keydown", esc, true); d.removeEventListener("focusout", left); };
  }, [box, on]);
}
