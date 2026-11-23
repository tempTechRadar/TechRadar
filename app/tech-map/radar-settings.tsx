"use client";
// 오른쪽 아래 ⚙ 지도 설정(P-12p 사용자 "잔잔하게"): 처음 연출(파동 · 끄기) + 뒤에서 도는 옅은 선(켜기 · 여운 · 속도 · 밝기 · 굵기) + [기본값으로].
// 값은 컨트롤러가 이 브라우저에 JSON 하나로 기억한다(radar-prefs.ts RADAR_KEY).
import { useEffect, useId, useRef, useState } from "react";
import { RADAR_DEFAULT, RADAR_RANGE, type RadarPrefs } from "@/lib/map/radar-prefs";
import "./radar-settings.css";

const INTRO_KO: [RadarPrefs["intro"], string][] = [["ripple", "파동"], ["off", "끄기"]];
/** 미끄럼 막대: [값 이름, 글, 한 칸, 보이는 값] */
const SLIDERS: [keyof typeof RADAR_RANGE, string, number, (v: number) => string][] = [
  ["trail", "여운", 5, (v) => `${v}°`], ["speed", "속도(한 바퀴)", 1, (v) => `${v}초`], ["alpha", "밝기", 0.01, (v) => `${Math.round(v * 100)}%`], ["width", "굵기", 0.5, (v) => `${v}px`],
];

export function RadarSettings({ prefs, still, onChange }: { prefs: RadarPrefs; still: boolean; onChange: (p: RadarPrefs) => void }) {
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

  return (
    <div ref={root} className="radar-set">
      <button ref={btn} type="button" className="radar-set-btn" aria-label="지도 설정" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>⚙</button>
      {open ? (
        <div id={id} className="radar-set-panel" role="group" aria-label="지도 설정">
          <fieldset disabled={still}><legend>처음 연출</legend>
            {INTRO_KO.map(([v, k]) => <label key={v}><input type="radio" name={`${id}-m`} checked={(still ? "off" : prefs.intro) === v} onChange={() => onChange({ ...prefs, intro: v })} /> {k}</label>)}
          </fieldset>
          <fieldset disabled={still}><legend>뒤에서 도는 선</legend>
            <label><input type="checkbox" checked={!still && prefs.idle} onChange={(e) => onChange({ ...prefs, idle: e.target.checked })} /> 켜기</label>
            {SLIDERS.map(([k, name, step, show]) => (
              <label key={k} className="radar-set-range">{name} <output>{show(prefs[k])}</output>
                <input type="range" min={RADAR_RANGE[k][0]} max={RADAR_RANGE[k][1]} step={step} value={prefs[k]} disabled={!prefs.idle} onChange={(e) => onChange({ ...prefs, [k]: Number(e.target.value) })} /></label>
            ))}
          </fieldset>
          <button type="button" className="btn" disabled={still} onClick={() => onChange(RADAR_DEFAULT)}>기본값으로</button>
          {still ? <p className="muted">기기 설정(움직임 줄이기)으로 꺼져 있어요.</p> : null}
          <p className="muted">처음 연출에서 파동이 닿아 떠오르며 켜지는 점은 36시간 안에 실제로 확인한 기술이에요. 흰 틀은 이번 주 새로 들어온 기술이에요.</p>
          <p className="muted">점 왼쪽 아래 꼬리표(관심 · 후보 · 보류)는 내 판단이에요.</p>
        </div>
      ) : null}
    </div>
  );
}
