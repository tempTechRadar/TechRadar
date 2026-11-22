"use client";
// 판단을 방금 저장한 첫 화면(P-12g C2): 주소의 ?saved=1을 지우고(새로 고치거나 다시 열면 움직이지 않게) 판단 카드로 초점을 옮긴다.
// 폼과 누른 단추가 사라져 초점이 body로 떨어지던 것을 대신하고, 화면 읽기는 카드 제목 "내 판단"과 판단 줄을 읽는다(새 live 영역 대신).
import { useEffect } from "react";

export function SavedFocus({ target }: { target: string }) {
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
    document.getElementById(target)?.focus();
  }, [target]);
  return null;
}
