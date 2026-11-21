"use client";
// 오른쪽 아래 ⚙ 지도 설정(P-12f에서 이름 바꿈)(11-21 사용자 "전부 추천대로"): 방식(선 · 파동 · 끄기)과 분위기(잔잔하게 · 기본 · 생생하게).
// 보기 창에 있던 '움직임'을 옮겨 왔다. 값은 컨트롤러가 이 브라우저에 기억한다(techradar-map-motion · techradar-map-tune).
import { useEffect, useId, useRef, useState } from "react";
import type { Tune } from "@/lib/map/motion";
import type { Motion } from "./controller";
import "./radar-settings.css";

const MOTION_KO: [Motion, string][] = [["sweep", "선"], ["ripple", "파동"], ["off", "끄기"]];
const TUNE_KO: [Tune, string][] = [["calm", "잔잔하게"], ["base", "기본"], ["vivid", "생생하게"]];

export function RadarSettings({ motion, tune, still, onMotion, onTune }: {
  motion: Motion; tune: Tune; still: boolean; onMotion: (m: Motion) => void; onTune: (t: Tune) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    // 열려 있으면 Esc는 포커스가 어디 있든 이 창을 먼저 닫는다(잡는 단계에서 막아 사이드바의 Esc까지 가지 않게)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); setOpen(false);
      if (root.current?.contains(document.activeElement)) btn.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const off = still || motion === "off";

  return (
    <div ref={root} className="radar-set">
      <button ref={btn} type="button" className="radar-set-btn" aria-label="지도 설정" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>⚙</button>
      {open ? (
        <div id={id} className="radar-set-panel" role="group" aria-label="지도 설정">
          <fieldset disabled={still}><legend>방식</legend>
            {MOTION_KO.map(([v, k]) => <label key={v}><input type="radio" name={`${id}-m`} checked={(still ? "off" : motion) === v} onChange={() => onMotion(v)} /> {k}</label>)}
          </fieldset>
          {still ? <p className="muted">기기 설정(움직임 줄이기)으로 꺼져 있어요.</p> : null}
          <fieldset disabled={off}><legend>분위기</legend>
            {TUNE_KO.map(([v, k]) => <label key={v}><input type="radio" name={`${id}-t`} checked={tune === v} onChange={() => onTune(v)} /> {k}</label>)}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}
