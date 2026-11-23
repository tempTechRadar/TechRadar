// 관리자 화면 문법(11-23 I-admin-unify): 모든 관리자 화면이 같은 조각 · 같은 순서로 그린다.
// 순서 = AdminShell 머리 → AdminToolbar → AdminNotes → AdminSummary → (FilterForm) → AdminSection들.
// 툴바 · 알림은 AdminShell이 props로 받아 이 순서로만 그린다(화면마다 위치가 달라지지 않게). 숫자 띠 · 필터 · 섹션은 본문(children)에서 이 순서로 쓴다.
// 서버 · 클라이언트 어느 쪽에서 불러도 되게 JSX만 둔다(서버 전용 가져오기 없음). 판단 단추는 여기 없다(불변 1).
import Link from "next/link";
import type { ReactNode } from "react";

export type AdminLink = { href: string; label: string };
export type ToolbarProps = { links?: AdminLink[]; primary?: ReactNode };

/** 본문 첫 줄: 왼쪽 = 관련 화면 링크(같은 모양의 보조 단추), 오른쪽 = 이 화면의 주 행동 하나(청록, 있으면) */
export function AdminToolbar({ links = [], primary }: ToolbarProps) {
  return (
    <div className="admin-toolbar">
      {links.length > 0 ? (
        <nav aria-label="관련 화면" className="admin-toolbar-links">
          {links.map((l) => <Link key={l.href} className="admin-linkbtn" href={l.href}>{l.label}</Link>)}
        </nav>
      ) : <span />}
      {primary ? <div className="admin-toolbar-primary">{primary}</div> : null}
    </div>
  );
}

export type NoteTone = "success" | "info" | "warning" | "danger";
export type AdminNote = { tone: NoteTone; text: ReactNode; role?: "alert" | "status" | "note" };

/** 위험 · 주의는 바로 읽어 주고(alert), 성공 · 정보는 조용히(status). 화면이 따로 정하면 그 값 */
export const noteRole = (n: AdminNote) => n.role ?? (n.tone === "danger" || n.tone === "warning" ? "alert" : "status");

/** 성공 · 정보 · 경고 · 오류 알림을 툴바 바로 아래 한 곳에 같은 모양으로. 빈 값(null · false)은 건너뛴다 */
export function AdminNotes({ items }: { items: (AdminNote | null | false | undefined)[] }) {
  const notes = items.filter((n): n is AdminNote => Boolean(n));
  if (notes.length === 0) return null;
  return (
    <div className="admin-notes">
      {notes.map((n, i) => <p key={i} role={noteRole(n)} className={`admin-note ${n.tone}`}>{n.text}</p>)}
    </div>
  );
}

/** 숫자 띠: 알림 아래 같은 자리, 같은 모양. 숫자가 있는 화면만 */
export function AdminSummary({ label, items }: { label: string; items: { value: ReactNode; label: string; note?: string }[] }) {
  return (
    <ul className="admin-counts" aria-label={label}>
      {items.map((it) => (
        <li key={it.label}><b>{it.value}</b><span>{it.label}</span>{it.note ? <small>{it.note}</small> : null}</li>
      ))}
    </ul>
  );
}

/** 모든 본문 묶음: h2 크기 · 위 여백 · 설명(흐림) · 구분선이 같다. actions = 제목 줄 오른쪽(선택) */
export function AdminSection({ id, title, desc, actions, children }: { id: string; title: ReactNode; desc?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="admin-section" aria-labelledby={id}>
      <div className="admin-section-head">
        <h2 id={id}>{title}</h2>
        {actions ? <div className="admin-section-actions">{actions}</div> : null}
      </div>
      {desc ? <p className="admin-section-desc">{desc}</p> : null}
      {children}
    </section>
  );
}

/** 빈 상태 한 줄(없는 것). 못 읽은 것은 이걸 쓰지 않고 오류 알림으로(불변 2) */
export function AdminEmpty({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}

/** 단추 동작이 여러 개인 화면의 칸(시뮬레이터 · 실패 시연): 한 줄에 나란히, 단추는 칸 아래로 줄 맞춤, 좁으면 한 칸씩 */
export function AdminTiles({ children }: { children: ReactNode }) {
  return <div className="admin-tiles">{children}</div>;
}

export function AdminTile({ id, title, desc, children }: { id: string; title: ReactNode; desc?: ReactNode; children?: ReactNode }) {
  return (
    <section className="admin-tile" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {desc ? <div className="admin-tile-desc">{desc}</div> : null}
      {children ? <div className="admin-tile-actions">{children}</div> : null}
    </section>
  );
}
