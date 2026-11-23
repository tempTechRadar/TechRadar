"use client";
// 메뉴 오른쪽 종 알림(11-21 사용자 결정, 요즘 웹앱 전형): 배지 = 판단 대기 수, 누르면 최근 알림 5개 + "알림 모두 보기".
// 펼칠 때만 읽는다(메뉴는 모든 화면에 있어 미리 읽으면 매번 DB를 부른다). 읽은 판단 대기 수로 배지도 고친다(레이아웃 수는 화면 이동 중 옛 값일 수 있음).
// 로그인 전에는 알림 화면(그 자리 로그인 안내)으로 가는 링크.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KIND_LABEL, listTime } from "@/lib/alerts/to-alert-view";
import { badgeLabel, nextBadge, type Badge } from "@/lib/nav/badge-move";
import type { RecentAlert } from "@/lib/server/recent-alerts";
import { recentAlerts } from "./recent-alerts";
import { useDismiss } from "./use-dismiss";

const Bell = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const kindText = (kind: string) => KIND_LABEL[kind as keyof typeof KIND_LABEL]?.label ?? kind;

export function AlertBell({ pending: first, login }: { pending: number | null; login: boolean }) {
  const here = usePathname().startsWith("/alerts") ? "page" : undefined; // 알림 화면이면 종도 "지금 화면"(P-12n)
  const box = useRef<HTMLDetailsElement>(null);
  const ask = useRef(0); // 마지막으로 펼친 요청만 반영(빨리 닫았다 열면 늦게 온 옛 답이 덮지 않게)
  const [items, setItems] = useState<RecentAlert[] | null | undefined>(undefined); // undefined = 읽는 중, null = 못 읽음
  // 배지 = 판단 대기 수 + 한 번 움직일 방향(P-12g C3). 레이아웃이 준 새 수(판단 저장 · 새 사건)는 움직이고, 종을 펼쳐 바로잡은 수는 조용히
  const [badge, setBadge] = useState<Badge>({ n: first, dir: null });
  // 늘었을 때만 한 번 읽는다(줄어든 것은 판단 화면이 이미 말함). k: 같은 글이 다시 와도 새로 붙어 다시 읽히게
  const [said, setSaid] = useState({ text: "", k: 0 });
  const show = (n: number | null, animate: boolean) => setBadge((b) => nextBadge(b, n, animate));
  useEffect(() => { if (badge.dir === "up") setSaid((s) => ({ text: `판단 대기 ${badge.n}건으로 늘었어요`, k: s.k + 1 })); }, [badge]);
  useEffect(() => show(first, true), [first]); // 레이아웃이 새 수를 주면 그것으로
  const pending = badge.n;
  useDismiss(box, login);
  if (!login) return <Link href="/alerts" className="nav-icon" aria-label="알림" aria-current={here}><Bell /></Link>;
  const open = () => {
    const n = ++ask.current;
    setItems(undefined);
    recentAlerts().then((r) => { if (n !== ask.current) return; setItems(r?.items ?? null); if (r) show(r.pending, false); }, () => { if (n === ask.current) setItems(null); });
  };
  const shut = () => { if (box.current) box.current.open = false; };
  const label = badgeLabel(pending);
  return (
    <>
    <details ref={box} className="nav-pop" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) open(); }}>
      {/* key = 보이는 글: 바뀔 때만 새로 붙어 data-dir 방향으로 한 번 움직인다(움직임 줄이기면 --dur 0s) */}
      <summary className="nav-icon" data-current={here ? "" : undefined} aria-label={pending ? `알림, 판단 대기 ${pending}건` : "알림"}><Bell />{label ? <span key={label} className="nav-badge" aria-hidden="true" data-dir={badge.dir ?? undefined}>{label}</span> : null}</summary>
      <div className="site-nav-menu nav-alerts">
        <p className="nav-alerts-head">알림{pending ? ` · 판단 대기 ${pending}` : ""}</p>
        {items === undefined ? <p className="muted">읽는 중…</p>
          : items === null ? <p className="muted">알림을 불러오지 못했어요. 알림이 없다는 뜻이 아니에요.</p>
          : items.length === 0 ? <p className="muted">아직 알림이 없어요.</p>
          : <ul>{items.map((a) => (
              <li key={a.id}><Link href={`/alerts/${a.id}`} onClick={shut}>
                <span className={a.pending ? "nav-dot" : "nav-dot done"} aria-hidden="true" />
                <span><b>{a.name}</b><span className="muted"> · {kindText(a.kind)}{a.pending ? " · 판단 대기" : ""} · {listTime.format(new Date(a.at))}</span></span>
              </Link></li>
            ))}</ul>}
        <Link href="/alerts" onClick={shut} className="nav-alerts-all">알림 모두 보기</Link>
      </div>
    </details>
    {/* details 바깥: 닫힌 details 안의 live 줄은 읽히지 않는다 */}
    <span className="sr-only" role="status"><span key={said.k}>{said.text}</span></span>
    </>
  );
}
