"use client";
// 메뉴 오른쪽 계정 펼침(11-21 사용자 결정 "계정 묶기", 아바타 = 별명 첫 글자: 프로필 사진은 받지 않는다): 대시보드 · 내 프로젝트 · 설정 · 관리자 · 로그아웃을 하나로(대시보드 · 내 프로젝트는 안내서 공통 필수) 모아 메뉴 바를 짧게.
// <details>라 스크립트 없이도 열리고 닫힌다. 링크를 누르거나 useDismiss 규칙(바깥 · 포커스 떠남 · Esc)으로 닫는다.
import Link from "next/link";
import { useRef } from "react";
import { signOut } from "@/app/auth/actions";
import { useDismiss } from "./nav/use-dismiss";

export function AccountMenu({ name, admin }: { name: string; admin: boolean }) {
  const box = useRef<HTMLDetailsElement>(null);
  useDismiss(box);
  const shut = () => { if (box.current) box.current.open = false; };
  return (
    <details ref={box} className="site-nav-account">
      <summary aria-label={`${name}, 계정 메뉴`}><span className="nav-avatar" aria-hidden="true">{Array.from(name.trim())[0] ?? "?"}</span></summary>
      <div className="site-nav-menu">
        <p className="site-nav-name">{name}</p>
        <Link href="/guide" onClick={shut}>Tutorial</Link>
        <Link href="/settings" onClick={shut}>설정</Link>
        {admin ? <Link href="/admin" onClick={shut}>관리자</Link> : null}
        <form action={signOut}><button type="submit">로그아웃</button></form>
      </div>
    </details>
  );
}
