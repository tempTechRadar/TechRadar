// 관리자 화면 공통 틀(11-23 리뉴얼): 넓은 화면은 왼쪽 묶음 메뉴 + 오른쪽 본문, 좁은 화면(760px 이하)은 위쪽 가로 밀기 메뉴.
// 본문 머리 = 묶음 이름 · 제목 · 설명 · "이 화면이 증명하는 것". 막힘 · 읽기 실패 안내는 그대로. 판단 버튼은 어느 탭에도 없다(불변 1, PRD-F27).
import Link from "next/link";
import type { ReactNode } from "react";
import { groupLabelOf, groupTabs } from "./admin-nav";
import { AdminNotes, AdminToolbar, type AdminNote, type ToolbarProps } from "./admin-ui";
import "./admin.css";

// 기존 9개의 id · href · label은 그대로(다른 파일 · 시험이 읽는다). 탭 밖이던 두 화면(지금 실행 · 실패 시연)을 메뉴에 더했다. 묶음은 admin-nav.ts
export const ADMIN_TABS = [
  { id: "members", href: "/admin/members", label: "회원과 권한" },
  { id: "observations", href: "/admin/observations", label: "수집 자료" },
  { id: "alerts", href: "/admin/alerts", label: "알림과 처리 현황" },
  { id: "runs", href: "/admin/runs", label: "수집 실행과 오류" },
  { id: "flow", href: "/admin/flow", label: "흐름 화면" },
  { id: "classify", href: "/admin/classify", label: "분류 확인" },
  { id: "reports", href: "/admin/reports", label: "사용기 신고" },
  { id: "simulator", href: "/admin/simulator", label: "시뮬레이터" },
  { id: "chat", href: "/admin/chat", label: "위키 챗봇" },
  { id: "run-now", href: "/admin/run-now", label: "지금 한 번 실행" },
  { id: "demo", href: "/admin/demo", label: "실패 시연과 채점" },
] as const;

const NAV = groupTabs(ADMIN_TABS);

/** proves: 이 화면이 심사 · 시연에서 증명하는 것 한 줄(선택). toolbar · notes: 관리자 화면 문법(admin-ui.tsx)의 1 · 2번 자리 */
type Props = {
  tab: string; title: string; lead?: string; proves?: string; blocked?: "forbidden" | "no_db"; error?: string | null;
  toolbar?: ToolbarProps; notes?: (AdminNote | null | false | undefined)[]; children?: ReactNode;
};

function AdminNav({ tab }: { tab: string }) {
  return (
    <nav aria-label="관리자 메뉴" className="admin-side">
      <Link href="/admin" className="admin-home" aria-current={tab === "" ? "page" : undefined}>관제 요약</Link>
      {NAV.map((g) => (
        <div key={g.id} className="admin-group">
          <p className="admin-group-name" id={`admin-group-${g.id}`}>{g.label}{g.note ? <span> · {g.note}</span> : null}</p>
          <ul aria-labelledby={`admin-group-${g.id}`}>
            {g.items.map((t) => (
              <li key={t.id}><Link href={t.href} aria-current={t.id === tab ? "page" : undefined}>{t.label}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ tab, title, lead, proves, blocked, error, toolbar, notes = [], children }: Props) {
  // 순서는 여기서만 정한다: 머리 → 툴바 → 알림(막힘 · 읽기 실패가 먼저) → 본문(숫자 띠 → 필터 → 섹션)
  const shellNotes: AdminNote[] = [];
  if (blocked === "forbidden") shellNotes.push({ tone: "danger", text: "관리자만 볼 수 있어요." });
  if (blocked === "no_db") shellNotes.push({ tone: "danger", text: "Supabase 연결 전이에요. .env.local을 확인해 주세요." });
  if (error) shellNotes.push({ tone: "danger", text: `불러오지 못했어요(없는 게 아니에요): ${error}` });
  return (
    <main className="admin" data-solo={blocked === "forbidden" ? "" : undefined}>
      {blocked === "forbidden" ? null : <AdminNav tab={tab} />}{/* P-12y M2: 관리자가 아니면 메뉴를 보이지 않고 안내만 */}
      <div className="admin-main">
        <header className="admin-head">
          <p className="admin-eyebrow">{tab === "" ? "관리자" : groupLabelOf(tab)}</p>
          <h1>{title}</h1>
          {lead ? <p className="admin-lead">{lead}</p> : null}
          {proves ? <p className="admin-proves"><b>이 화면이 증명하는 것</b> {proves}</p> : null}
        </header>
        {toolbar && !blocked ? <AdminToolbar {...toolbar} /> : null}
        <AdminNotes items={[...shellNotes, ...(blocked ? [] : notes)]} />
        {blocked || error ? null : children}
      </div>
    </main>
  );
}

/** 필터 칸(주소 값으로 보낸다. 자바스크립트 없이도 동작). */
export function FilterForm({ children }: { children: ReactNode }) {
  return (
    <form method="get" className="admin-filter">
      {children}
      <button type="submit">필터</button>
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
