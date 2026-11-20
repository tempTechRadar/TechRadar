"use client";
// 메뉴 링크: 지금 보는 화면이면 aria-current="page"(밑줄 · 굵게, 화면 읽기도 "현재 페이지").
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent } from "@/lib/nav/is-current";

export function NavLink({ href, className, label, children }: { href: string; className?: string; label?: string; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  return <Link href={href} className={className} aria-label={label} aria-current={isCurrent(path, href) ? "page" : undefined}>{children}</Link>;
}
