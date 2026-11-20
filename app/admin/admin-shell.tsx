// 관리자 화면 공통 틀: 탭, 제목, 막힘·읽기 실패 안내. 판단 버튼은 어느 탭에도 없다(불변 1, PRD-F27).
import Link from "next/link";
import type { ReactNode } from "react";
import "./admin.css";

export const ADMIN_TABS = [
  { id: "members", href: "/admin/members", label: "회원별 등록" },
  { id: "observations", href: "/admin/observations", label: "수집 자료" },
  { id: "alerts", href: "/admin/alerts", label: "알림과 처리 현황" },
  { id: "runs", href: "/admin/runs", label: "수집 실행과 오류" },
  { id: "flow", href: "/admin/flow", label: "흐름 화면" },
  { id: "classify", href: "/admin/classify", label: "분류 확인" },
  { id: "reports", href: "/admin/reports", label: "사용기 신고" },
  { id: "simulator", href: "/admin/simulator", label: "시뮬레이터" },
  { id: "chat", href: "/admin/chat", label: "위키 챗봇" },
] as const;

type Props = { tab: string; title: string; lead?: string; blocked?: "forbidden" | "no_db"; error?: string | null; children?: ReactNode };

export function AdminShell({ tab, title, lead, blocked, error, children }: Props) {
  return (
    <main className="admin">
      <nav aria-label="관리자 메뉴" className="admin-tabs">
        {ADMIN_TABS.map((t) => (
          <Link key={t.id} href={t.href} aria-current={t.id === tab ? "page" : undefined}>{t.label}</Link>
        ))}
      </nav>
      <h1>{title}</h1>
      {lead ? <p className="admin-lead">{lead}</p> : null}
      {blocked === "forbidden" ? <p role="alert" className="admin-note danger">관리자만 볼 수 있어요.</p> : null}
      {blocked === "no_db" ? <p role="alert" className="admin-note danger">Supabase 연결 전이에요. .env.local을 확인해 주세요.</p> : null}
      {error ? <p role="alert" className="admin-note danger">불러오지 못했어요(없는 게 아니라 조회 실패): {error}</p> : null}
      {blocked || error ? null : children}
    </main>
  );
}

/** 거르기 칸(주소 값으로 보낸다. 자바스크립트 없이도 동작). */
export function FilterForm({ children }: { children: ReactNode }) {
  return (
    <form method="get" className="admin-filter">
      {children}
      <button type="submit">거르기</button>
    </form>
  );
}

export const PERIOD_OPTIONS = [{ value: "", label: "전체 기간" }, { value: "7d", label: "최근 7일" }, { value: "30d", label: "최근 30일" }];

export function Select({ name, label, value, options }: { name: string; label: string; value: string; options: { value: string; label: string }[] }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

const fmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short", hour12: false });
export const when = (iso: string | null | undefined) => (iso ? fmt.format(new Date(iso)) : "—");

/** 값(jsonb)을 짧은 글로. 길면 자른다. */
export const brief = (v: unknown) => {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
};
