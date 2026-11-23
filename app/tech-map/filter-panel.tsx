"use client";
// 지도 왼쪽 필터 패널(P-12m Q2, 시안 "합본 · 지도" C 모양, 11-23 사용자 결정): 색 기준(기본 종류) 체크 = 점 색 범례 · 갈래 · 등급 표시 뜻.
// 아래쪽 범례 줄을 대신한다. ‹로 접고, 접힘은 이 브라우저에만 기억(편의). 좁은 화면(≤860)은 처음에 접혀 있다
import { useEffect, useState } from "react";
import { UNSORTED, type MapNode } from "@/lib/map/build-map";
import type { LegendItem, MapLayout } from "@/lib/map/layout";
import { DIM_KO, type Dim, type ViewConfig } from "@/lib/map/view-config";

type ListKey = "kinds" | "fields" | "subs";
const LIST_DIM: Record<ListKey, Dim> = { kinds: "kind", fields: "field", subs: "sub" };
const OPEN_KEY = "techradar-map-filter-open";
const SUB_MAX = 10;

const Dot = ({ l }: { l: Pick<LegendItem, "token" | "hollow"> }) => (
  <i className="map-dot" aria-hidden="true" style={l.hollow ? { border: `2px solid var(${l.token})` } : { background: `var(${l.token})` }} />
);

export function FilterPanel({ L, nodes, view, onView }: { L: MapLayout; nodes: MapNode[]; view: ViewConfig; onView: (v: ViewConfig) => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { // 브라우저 기억은 붙은 뒤에 읽는다(서버 첫 화면과 같게)
    let saved: string | null = null;
    try { saved = localStorage.getItem(OPEN_KEY); } catch { /* 저장소를 못 쓰면 기본 */ }
    setOpen(saved ? saved === "1" : !matchMedia("(max-width: 860px)").matches);
  }, []);
  const toggle = () => { const next = !open; setOpen(next); try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* 이번 화면에서만 */ } };
  const f = view.filter;
  const flip = (key: ListKey, v: string) => onView({ ...view, filter: { ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] } });
  const colorKey = (Object.keys(LIST_DIM) as ListKey[]).find((k) => LIST_DIM[k] === L.color);
  const subs = [...nodes.reduce((m, n) => (n.attrs.sub === UNSORTED ? m : m.set(n.attrs.sub, (m.get(n.attrs.sub) ?? 0) + 1)), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, SUB_MAX);
  return (
    <section className="map-filter" data-open={open ? "" : undefined} aria-label="필터">
      <button type="button" className="map-filter-toggle" aria-expanded={open} onClick={toggle} aria-label={open ? "필터 접기" : "필터 펼치기"}>
        {open ? <><span>필터</span><span aria-hidden="true">‹</span></> : <span aria-hidden="true">필터 ›</span>}
      </button>
      {open ? (
        <div className="map-filter-body">
          <fieldset>
            <legend>{DIM_KO[L.color]}</legend>
            {L.legend.map((l) => colorKey && !l.rest ? (
              <label key={l.value}><input type="checkbox" checked={f[colorKey].includes(l.value)} onChange={() => flip(colorKey, l.value)} /><Dot l={l} /><span>{l.value}</span><b>{l.count}</b></label>
            ) : <span key={l.value} className="map-filter-row"><Dot l={l} /><span>{l.value}</span><b>{l.count}</b></span>)}
          </fieldset>
          {L.color !== "sub" && subs.length ? (
            <fieldset>
              <legend>갈래</legend>
              {subs.map(([v, n]) => <label key={v}><input type="checkbox" checked={f.subs.includes(v)} onChange={() => flip("subs", v)} /><span>{v}</span><b>{n}</b></label>)}
            </fieldset>
          ) : null}
          <div className="map-filter-key" role="group" aria-label="등급 표시 뜻">
            <span className="map-filter-head">등급 표시</span>
            <span><i className="map-dot" data-grade="danger" aria-hidden="true" />✕ 위험</span>
            <span><i className="map-dot" data-grade="caution" aria-hidden="true" />! 주의</span>
            <span><i className="map-dot" data-grade="unknown" aria-hidden="true" />찾지 못함</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
