"use client";
// 메뉴의 로그인 링크: 로그인하면 지금 보던 화면으로 돌아온다(레이아웃은 서버에서 지금 주소를 몰라 브라우저에서 붙인다)
import Link from "next/link";
import { usePathname } from "next/navigation";

export function LoginLink({ className, children }: { className?: string; children: React.ReactNode }) {
  const path = usePathname() ?? "/";
  return <Link href={path === "/login" ? "/login" : `/login?next=${encodeURIComponent(path)}`} className={className}>{children}</Link>;
}
