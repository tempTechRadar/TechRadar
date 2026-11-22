"use client";
// 판단을 방금 저장한 첫 화면(P-12g C2): 주소의 ?saved=…를 지우고(새로 고치거나 다시 열면 움직이지 않게) 판단 카드로 초점을 옮긴다.
// state를 null로: Next 라우터 기록을 그대로 두면 뒤로 가기 · refresh가 ?saved가 붙은 화면을 되살린다(studio.tsx와 같게). 초점도 주소에 saved가 있을 때만.
// 폼과 누른 단추가 사라져 초점이 body로 떨어지던 것을 대신하고, 화면 읽기는 카드 제목 "내 판단"과 판단 줄을 읽는다(새 live 영역 대신).
import { useEffect } from "react";

export function SavedFocus({ target }: { target: string }) {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("saved")) return;
    window.history.replaceState(null, "", window.location.pathname);
    document.getElementById(target)?.focus();
  }, [target]);
  return null;
}
