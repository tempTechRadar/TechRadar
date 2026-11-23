"use client";
// 보기 묶음 탭(노션의 보기 탭처럼, 11-21 사용자): 누르면 그 보기로, 지금 보기와 같으면 눌린 표시, 다시 누르면 기본 보기.
// "지금 보기 저장"은 로그인했을 때만 이 브라우저에 사람마다 5개까지(보기 기억과 같은 규칙, design.md 14절, 같은 브라우저의 다른 계정에 안 보이게). 기본 묶음은 lib/map/presets.ts
import { useEffect, useState } from "react";
import { addPreset, BUILTIN_PRESETS, LS_NOTE, MAX_SAVED, parsePresets, type Preset } from "@/lib/map/presets";
import type { Say } from "../undo-toast";

/** who = 로그인한 사람 id, 없으면 로그인 전(저장 없음) */
type Props = { current: string; queryOf: (q: string) => string; countOf: (q: string) => number; apply: (q: string) => void; who?: string; canMine: boolean; say: Say };

export function ViewTabs({ current, queryOf, countOf, apply, who, canMine, say }: Props) {
  const login = !!who, KEY = `techradar-map-presets:${who}`;
  const [saved, setSaved] = useState<Preset[]>([]);
  const [name, setName] = useState<string | null>(null); // null = 이름 칸 닫힘
  useEffect(() => { if (login) try { setSaved(parsePresets(localStorage.getItem(KEY))); } catch { /* 저장소를 못 쓰는 브라우저: 기본 묶음만 */ } }, [login, KEY]);
  const store = (list: Preset[]) => { setSaved(list); try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 이번 화면에서만 */ } };
  const save = () => {
    const n = (name ?? "").trim();
    if (!n) return setName(null);
    const full = saved.length >= MAX_SAVED && !saved.some((p) => p.name === n);
    store(addPreset(saved, n, current)); setName(null);
    say(full ? `"${n}" 보기를 저장했어요. ${MAX_SAVED}개가 넘어 가장 오래된 것을 뺐어요.` : `"${n}" 보기를 저장했어요.`);
  };
  /** 내가 저장한 보기 지우기(P-12p 사용자): 말풍선의 되돌리기로 한 번 되살림. 기본 보기에는 단추 없음 */
  const remove = (p: Preset) => { const prev = saved; store(saved.filter((x) => x.name !== p.name)); say(`"${p.name}" 보기를 지웠어요.`, () => store(prev)); };
  const tab = (p: Preset, own: boolean) => {
    const on = queryOf(p.query) === current;
    return (
      <span key={(own ? "s:" : "b:") + p.name} className="map-tab-wrap">
        <button type="button" className="map-tab" aria-pressed={on} title={p.query === "pick=ls" ? LS_NOTE : undefined} onClick={() => apply(on ? "" : p.query)}>{p.name}</button>
        {own ? <button type="button" className="map-tab-x" aria-label={`${p.name} 보기 지우기`} onClick={() => remove(p)}>✕</button> : null}
      </span>
    );
  };
  return (
    <nav className="map-tabs" aria-label="보기 묶음">
      {/* 기본 묶음은 지금 지도에서 비는 것은 숨긴다(누르면 빈 지도뿐인 탭은 시연에서 고장처럼 보인다). 내가 저장한 것은 그대로 */}
      {BUILTIN_PRESETS.filter((p) => (!p.login || login) && (!p.mine || canMine) && (countOf(p.query) > 0 || queryOf(p.query) === current)).map((p) => tab(p, false))}{/* 켜진 탭은 비어도 남겨 끌 수 있게 */}
      {saved.map((p) => tab(p, true))}
      {login ? (name === null
        ? <button type="button" className="map-tab map-tab-add" onClick={() => setName("")}>+ 지금 보기 저장</button>
        : <form className="map-tab-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input autoFocus aria-label="저장할 보기 이름" maxLength={20} value={name} placeholder="보기 이름" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setName(null); } }} />
            <button type="submit" className="btn">저장</button>
          </form>) : null}
    </nav>
  );
}
