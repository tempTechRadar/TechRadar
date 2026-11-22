"use client";
// 보드 판 안의 작은 상호작용: 숫자 띠 기간 고르기(P-12k K1), 청사진 초안 "이어서 하기"(이 브라우저), 레포 서랍(오른쪽, 청사진 서랍 방식: Esc · 닫기, 초점은 연 자리로).
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const PERIODS: [string, string][] = [["", "전체"], ["1d", "오늘"], ["7d", "이번 주"], ["30d", "이번 달"]];
/** 숫자 띠 [기간 ▾]: 바꾸면 바로 보낸다(주소 ?period=, 알림 목록과 같은 값). 스크립트가 없으면 "보기" 단추 */
export function PeriodSelect({ value }: { value: string }) {
  return (
    <form className="band-period" action="/dashboard">
      <label>기간 <select name="period" defaultValue={PERIODS.some(([v]) => v === value) ? value : ""} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {PERIODS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select></label>
      <noscript><button type="submit" className="btn btn-sm">보기</button></noscript>
    </form>
  );
}

/** 청사진 초안(blueprint-draft-v2:<who>, 스튜디오가 이 브라우저에 둠)이 있으면 "이어서 하기: 이름". 서버 그림과 맞추려고 처음엔 안 보임 */
export function DraftResume({ who }: { who: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    try { const d = JSON.parse(localStorage.getItem(`blueprint-draft-v2:${who}`) ?? "null"); if (d?.graph) setName(typeof d.name === "string" && d.name ? d.name : "내 청사진"); } catch { /* 저장소를 막았거나 깨진 초안: 안 보임 */ }
  }, [who]);
  return name ? <Link href="/blueprint">이어서 하기: {name}</Link> : null;
}

/** 레포 이름 단추 → 오른쪽 서랍(그 레포의 내 기술 표 · 확정 청사진). 열면 서랍 머리로 초점, 닫으면 단추로 */
export function RepoDrawer({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); btn.current?.focus(); };
  return (
    <>
      <button ref={btn} type="button" className="repo-open" aria-expanded={open} onClick={() => setOpen(true)}>{name}</button>
      {/* 위젯 노드는 transform이 있어 그 안의 fixed가 화면이 아니라 노드 기준이 된다: 문서 맨 위로 꺼내 그린다 */}
      {open ? createPortal(
        <div className="page repo-drawer" role="dialog" aria-modal="false" aria-labelledby="repo-drawer-title" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <header className="bw-bar">
            <h2 id="repo-drawer-title" className="bw-title" tabIndex={-1} ref={(el) => el?.focus()}>{name}</h2>
            <button type="button" className="btn btn-sm" onClick={close}>닫기 ✕</button>
          </header>
          <div className="repo-drawer-body">{children}</div>
        </div>, document.body,
      ) : null}
    </>
  );
}
