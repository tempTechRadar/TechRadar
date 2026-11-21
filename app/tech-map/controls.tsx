"use client";
// 지도 위 도구 줄(시안 radar.html·radar-ui.js): 찾기(이름·설명·갈래) · 보기(묶기 1~3단계 · 색) · 필터(값마다 개수) · 보기 초기화,
// 그 아래 경로 칩(이 분류만 보기)과 요약 칩(이번 주 NEW · 내 기술과 비교군), 지도 아래 범례·상태 줄. 단추는 최소로(사용자 11-20).
import { useState } from "react";
import type { MapNode } from "@/lib/map/build-map";
import type { LegendItem, MapLayout } from "@/lib/map/layout";
import { DIMS, DIM_KO, filterCount, MAX_LEVELS, passes, type Dim, type ViewConfig, type ViewFilter } from "@/lib/map/view-config";
import { MapSearch, type FindHit } from "./map-search";

type ListKey = "kinds" | "fields" | "subs";
const LIST_DIM: Record<ListKey, Dim> = { kinds: "kind", fields: "field", subs: "sub" };
const sortKo = (a: string, b: string) => a.localeCompare(b, "ko");

export function Toolbar({ nodes, view, projects, canMine, login, onView, onReset, onFind, onGo }: {
  nodes: MapNode[]; view: ViewConfig; projects: { id: string; name: string }[]; canMine: boolean; login: boolean;
  onView: (v: ViewConfig) => void; onReset: () => void; onGo: (key: string) => void; onFind: (q: string) => FindHit[];
}) {
  const [open, setOpen] = useState<"" | "view" | "filter">("");
  const [resets, setResets] = useState(0); // 보기 초기화 때 찾기 칸도 비운다(새로 그림)
  const f = view.filter, n = filterCount(view);
  const setFilter = (patch: Partial<ViewFilter>) => onView({ ...view, filter: { ...f, ...patch } });
  const setLevel = (i: number, dim: Dim | "") => {
    const group = dim ? [...view.group.slice(0, i), dim] : view.group.slice(0, i);
    onView({ ...view, group, color: view.color === view.group[0] ? group[0] ?? view.color : view.color });
  };
  // 값마다 개수: 들어간 분류 안에서 센다(Glama 필터 칩 참고)
  const base = nodes.filter((x) => view.scope.every((s) => x.attrs[s.dim] === s.value));
  const count = (fn: (x: MapNode) => boolean) => base.filter(fn).length;
  const values = (dim: Dim) => [...new Set(base.map((x) => x.attrs[dim]))].sort(sortKo);
  const toggleValue = (key: ListKey, v: string) => setFilter({ [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] });
  const box = (key: ListKey, v: string) => (
    <label key={v} className="check"><input type="checkbox" checked={f[key].includes(v)} onChange={() => toggleValue(key, v)} /> {v} <span className="muted">{count((x) => x.attrs[LIST_DIM[key]] === v)}</span></label>
  );

  return (
    <div className="map-hud">
      <MapSearch key={resets} onFind={onFind} login={login} projects={projects} onPick={(r) => { if (r.key) onGo(r.key); else onView({ ...view, scope: [r.scope!] }); }} />
      <div className="map-pop">
        <button type="button" className="btn" aria-expanded={open === "view"} onClick={() => setOpen(open === "view" ? "" : "view")}>보기</button>
        {open === "view" ? (
          <div className="map-pop-panel">
            <fieldset><legend>묶기(안쪽 고리부터)</legend>
              {Array.from({ length: Math.min(MAX_LEVELS, view.group.length + 1) }, (_, i) => (
                <label key={i}>{i + 1}단계 <select value={view.group[i] ?? ""} onChange={(e) => setLevel(i, e.target.value as Dim | "")}>
                  <option value="">없음</option>
                  {DIMS.filter((d) => !view.group.slice(0, i).includes(d) && (d !== "project" || canMine)).map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}
                </select></label>
              ))}
            </fieldset>
            <fieldset><legend>색</legend>
              <label>색 기준 <select value={view.color} onChange={(e) => onView({ ...view, color: e.target.value as Dim })}>
                {DIMS.filter((d) => d !== "project" || canMine).map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}
              </select></label>
            </fieldset>
          </div>
        ) : null}
      </div>
      <div className="map-pop">
        <button type="button" className="btn" aria-expanded={open === "filter"} onClick={() => setOpen(open === "filter" ? "" : "filter")}>필터{n ? ` ${n}` : ""}</button>
        {open === "filter" ? (
          <div className="map-pop-panel">
            <fieldset><legend>보안</legend>
              <label className="check"><input type="checkbox" checked={f.risky} onChange={(e) => setFilter({ risky: e.target.checked })} /> 위험·주의만 <span className="muted">{count((x) => x.grade === "danger" || x.grade === "caution")}</span></label>
              <label className="check"><input type="checkbox" checked={f.err} onChange={(e) => setFilter({ err: e.target.checked })} /> 수집 오류만 <span className="muted">{count((x) => !!x.collectErrorKind)}</span></label>
            </fieldset>
            <fieldset><legend>새로 들어옴</legend>
              <label className="check"><input type="checkbox" checked={f.newOnly} onChange={(e) => setFilter({ newOnly: e.target.checked })} /> NEW만(7일) <span className="muted">{count((x) => x.isNew)}</span></label>
            </fieldset>
            <fieldset><legend>내 기술</legend>
              <label className="check"><input type="checkbox" checked={f.mineOnly} disabled={!canMine} onChange={(e) => setFilter({ mineOnly: e.target.checked })} /> 내 기술과 비교군(한 단계){canMine ? <span className="muted"> {count((x) => x.mine || x.nearMine)}</span> : " (로그인하고 프로젝트를 등록한 뒤)"}</label>
              {canMine && projects.length > 1 ? (
                <label>프로젝트 <select value={f.project} onChange={(e) => setFilter({ project: e.target.value })}>
                  <option value="">전체</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              ) : null}
            </fieldset>
            <fieldset><legend>종류</legend>{values("kind").map((v) => box("kinds", v))}</fieldset>
            <fieldset><legend>하는 일</legend>{values("field").map((v) => (
              <div key={v}>{box("fields", v)}{f.fields.includes(v) ? (
                <div className="map-subf" role="group" aria-label={`${v}의 세부 갈래`}>{[...new Set(base.filter((x) => x.attrs.field === v).map((x) => x.attrs.sub))].sort(sortKo).map((s) => box("subs", s))}</div>
              ) : null}</div>
            ))}</fieldset>
            {n ? <button type="button" className="btn" onClick={() => onView({ ...view, filter: { ...f, kinds: [], fields: [], subs: [], risky: false, mineOnly: false, newOnly: false, err: false, project: "" } })}>필터 모두 끄기</button> : null}
          </div>
        ) : null}
      </div>
      <button type="button" className="btn" onClick={() => { setOpen(""); setResets(resets + 1); onReset(); }}>보기 초기화</button>
    </div>
  );
}

export function Crumbs({ view, onView }: { view: ViewConfig; onView: (v: ViewConfig) => void }) {
  if (!view.scope.length) return null;
  return (
    <nav className="map-crumbs" aria-label="보고 있는 분류">
      <button type="button" className="chip" onClick={() => onView({ ...view, scope: [] })}>전체</button>
      {view.scope.map((s, i) => (
        <span key={s.dim}><span aria-hidden="true">›</span>{i === view.scope.length - 1
          ? <b aria-current="location">{s.value}</b>
          : <button type="button" className="chip" onClick={() => onView({ ...view, scope: view.scope.slice(0, i + 1) })}>{s.value}</button>}</span>
      ))}
      <button type="button" className="chip" aria-label="분류만 보기 끝내기" onClick={() => onView({ ...view, scope: [] })}>✕</button>
    </nav>
  );
}

export function SummaryChips({ nodes, view, canMine, onView }: { nodes: MapNode[]; view: ViewConfig; canMine: boolean; onView: (v: ViewConfig) => void }) {
  const nw = nodes.filter((x) => x.isNew).length, near = nodes.filter((x) => x.mine || x.nearMine).length;
  const flip = (k: "newOnly" | "mineOnly" | "err") => onView({ ...view, filter: { ...view.filter, [k]: !view.filter[k] } });
  // 띠(design.md 17절 3차): 수집 오류 수. 필터가 켜져 있으면 0이어도 보여서 끌 수 있게
  // shortcut: "마지막 수집"은 정기 실행 기록(runs)을 읽어야 정확해서 아직 없음. 노드 하나의 확인 시각은 지도 전체가 최신인 것처럼 보이게 한다
  const errs = nodes.filter((x) => x.collectErrorKind).length;
  return (
    <>
      {canMine ? <button type="button" className="chip" aria-pressed={view.filter.mineOnly} onClick={() => flip("mineOnly")}>내 기술과 비교군 <b>{near}</b></button> : null}
      <button type="button" className="chip" aria-pressed={view.filter.newOnly} onClick={() => flip("newOnly")}>이번 주 NEW <b>{nw}</b></button>
      {errs > 0 || view.filter.err ? <button type="button" className="chip" aria-pressed={view.filter.err} onClick={() => flip("err")}>수집 오류 <b>{errs}</b></button> : null}
    </>
  );
}

/** 범례: 색 기준 값을 누르면 그 값만 필터(하는 일·세부 갈래·종류일 때) */
export function Legend({ L, view, onView }: { L: MapLayout; view: ViewConfig; onView: (v: ViewConfig) => void }) {
  const key = (Object.keys(LIST_DIM) as ListKey[]).find((k) => LIST_DIM[k] === L.color);
  const dot = (l: LegendItem) => <i className="map-dot" aria-hidden="true" style={l.hollow ? { border: `2px solid var(${l.token})` } : { background: `var(${l.token})` }} />;
  return (
    <div className="map-legend" aria-label={`범례 · 색 = ${DIM_KO[L.color]}`}>
      <span className="muted">색 = {DIM_KO[L.color]}</span>
      {L.legend.map((l) => key && !l.rest ? (
        <button key={l.value} type="button" className="chip" aria-pressed={view.filter[key].includes(l.value)}
          onClick={() => onView({ ...view, filter: { ...view.filter, [key]: view.filter[key].includes(l.value) ? view.filter[key].filter((x) => x !== l.value) : [...view.filter[key], l.value] } })}>{dot(l)}{l.value} {l.count}</button>
      ) : <span key={l.value} className="chip">{dot(l)}{l.value} {l.count}</span>)}
    </div>
  );
}

export function Status({ L, collapsed, nodes, view }: { L: MapLayout; collapsed: number; nodes: MapNode[]; view: ViewConfig }) {
  const shown = nodes.filter((x) => passes(x, view));
  const d = shown.filter((x) => x.grade === "danger").length, w = shown.filter((x) => x.grade === "caution").length, e = shown.filter((x) => x.collectErrorKind).length;
  return <p className="map-status" role="status">보이는 기술 {L.shown} / 지도에 올린 기술 {L.total}{collapsed ? ` · 접힌 묶음 ${collapsed}` : ""} · 위험 {d} · 주의 {w}{e ? ` · 수집 오류 ${e}(점선 고리)` : ""}</p>;
}
