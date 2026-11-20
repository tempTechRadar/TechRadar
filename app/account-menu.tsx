"use client";
// 메뉴 오른쪽 계정 펼침(11-21 사용자 결정 "계정 묶기"): 내 프로젝트 · 설정 · 관리자 · 로그아웃을 하나로 모아 메뉴 바를 짧게.
// <details>라 스크립트 없이도 열리고 닫힌다. 링크를 누르거나, 바깥을 누르거나, 포커스가 메뉴를 떠나거나, 메뉴 안에서 Esc를 누르면 닫는다.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { signOut } from "@/app/auth/actions";

export function AccountMenu({ name, admin }: { name: string; admin: boolean }) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const d = box.current!;
    const outside = (e: MouseEvent) => { if (d.open && !d.contains(e.target as Node)) d.open = false; };
    // Esc는 메뉴가 열려 있고 포커스가 메뉴 안에 있을 때만 여기서 끝낸다(같은 키로 지도 사이드바까지 닫히지 않게: 캡처 단계에서 멈춤)
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
  }, []);
  const shut = () => { if (box.current) box.current.open = false; };
  return (
    <details ref={box} className="site-nav-account">
      <summary aria-label={`${name}, 계정 메뉴`}><span className="site-nav-name">{name}</span> <span aria-hidden="true">▾</span></summary>
      <div className="site-nav-menu">
        <Link href="/projects" onClick={shut}>내 프로젝트</Link>
        <Link href="/settings" onClick={shut}>설정</Link>
        {admin ? <Link href="/admin" onClick={shut}>관리자</Link> : null}
        <form action={signOut}><button type="submit">로그아웃</button></form>
      </div>
    </details>
  );
}
