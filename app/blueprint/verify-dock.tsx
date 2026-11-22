"use client";
// 청사진 에디터 아래 검증 독(P-12j H1): 높이 조절 · 접기, 탭 = 검증 결과 · 변경 이력 · 구성 요약 · 실행 로그. 내용은 H4(지금은 검증 결과만 확정 창과 같은 "고칠 것").
import { useEffect, useRef, useState } from "react";

export type VerifyTab = "result" | "changes" | "summary" | "log";
const TABS: [VerifyTab, string][] = [["result", "검증 결과"], ["changes", "변경 이력"], ["summary", "구성 요약"], ["log", "실행 로그"]];
const H = { min: 120, start: 200, step: 24, max: 560 };
/** 높이 한도 = 화면 높이의 50%. 서버는 화면을 몰라 기본값으로 그리고, 붙은 뒤(useEffect) 맞춘다(하이드레이션 어긋남 없게) */
function useMaxH() {
  const [max, setMax] = useState(H.max);
  useEffect(() => {
    const fit = () => setMax(Math.max(H.min, Math.round(window.innerHeight * 0.5)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return max;
}

/** state = 열림 · 탭(위 막대 "검증"이 열고 검증 결과 탭으로). problems = 확정을 막는 것(studio가 확정 창과 같은 값을 줌) */
export function VerifyDock({ state, onState, problems }: { state: { open: boolean; tab: VerifyTab }; onState: (s: { open: boolean; tab: VerifyTab }) => void; problems: string[] }) {
  const [h, setH] = useState(H.start);
  const max = useMaxH();
  const clamp = (v: number) => Math.min(max, Math.max(H.min, Math.round(v)));
  const { open, tab } = state;
  return (
    <section className="vd" aria-label="검증 독" data-open={open || undefined} style={{ height: open ? Math.min(h, max) : undefined }}>
      {open ? <Resizer h={Math.min(h, max)} max={max} onH={(v) => setH(clamp(v))} /> : null}
      <div className="dock-bar">
        <div className="dock-tabs" role="group" aria-label="검증 독 보기">
          {TABS.map(([k, name]) => <button key={k} type="button" className="dock-tab" aria-pressed={open && tab === k} onClick={() => onState({ open: true, tab: k })}>{name}</button>)}
        </div>
        <button type="button" className="dock-tab" aria-expanded={open} onClick={() => onState({ open: !open, tab })}>{open ? "접기 ▼" : "펼치기 ▲"}</button>
      </div>
      {open ? (
        <div className="dock-body">
          {tab !== "result" ? <p className="muted">다음 단계(H4)에서 채워요.</p>
            : problems.length ? <ul className="vd-list">{problems.map((x) => <li key={x}>{x}</li>)}</ul>
            : <p>확정을 막는 것이 없어요.</p>}
        </div>
      ) : null}
    </section>
  );
}

/** 높이 조절 막대: 끌거나(포인터) ↑ ↓ 키로 24px씩 */
function Resizer({ h, max, onH }: { h: number; max: number; onH: (v: number) => void }) {
  const from = useRef<{ y: number; h: number } | null>(null);
  return (
    <div className="dock-resize" role="separator" aria-orientation="horizontal" aria-label="검증 독 높이" tabIndex={0}
      aria-valuenow={h} aria-valuemin={H.min} aria-valuemax={max}
      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onH(h + (e.key === "ArrowUp" ? H.step : -H.step)); } }}
      onPointerDown={(e) => { from.current = { y: e.clientY, h }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (from.current) onH(from.current.h + from.current.y - e.clientY); }}
      onPointerUp={() => { from.current = null; }} onPointerCancel={() => { from.current = null; }} />
  );
}
