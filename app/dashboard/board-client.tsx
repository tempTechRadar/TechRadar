"use client";
// 보드 위젯 안의 작은 상호작용(P-12i D2): W4 "지금 / 추이" 토글, W3 레포 서랍(오른쪽, 청사진 서랍 방식: Esc · 닫기, 초점은 연 자리로).
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ViewToggle({ now, trend }: { now: ReactNode; trend: ReactNode }) {
  const [v, setV] = useState<"now" | "trend">("now");
  return (
    <>
      <span className="board-toggle" role="group" aria-label="보기">
        <button type="button" className="btn btn-sm" aria-pressed={v === "now"} onClick={() => setV("now")}>지금</button>
        <button type="button" className="btn btn-sm" aria-pressed={v === "trend"} onClick={() => setV("trend")}>추이(주별)</button>
      </span>
      {v === "now" ? now : trend}
    </>
  );
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
