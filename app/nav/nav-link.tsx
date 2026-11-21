"use client";
// 메뉴 링크: 지금 보는 화면이면 aria-current="page"(밑줄 · 굵게, 화면 읽기도 "현재 페이지").
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrent } from "@/lib/nav/is-current";

/** also: 이 메뉴로 치는 다른 주소(위 메뉴 "지도"는 보드 · 일지에서도 현재) */
export function NavLink({ href, className, label, also = [], children }: { href: string; className?: string; label?: string; also?: string[]; children: React.ReactNode }) {
  const path = usePathname() ?? "";
  const current = [href, ...also].some((h) => isCurrent(path, h));
  return <Link href={href} className={className} aria-label={label} aria-current={current ? "page" : undefined}>{children}</Link>;
}
