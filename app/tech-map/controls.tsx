"use client";
// 지도 위 도구 줄(시안 radar.html·radar-ui.js): 찾기(이름·설명·갈래) · 보기(묶기 1~3단계 · 색) · 필터(값마다 개수) · 보기 초기화,
// 그 아래 경로 칩(이 분류만 보기)과 늘 보이는 빠른 칩(들어온 때 · 위험 · 관심 · 내 기술), 지도 아래 범례·상태 줄. 단추는 최소로(사용자 11-20).
import { useEffect, useState } from "react";
import type { MapNode } from "@/lib/map/build-map";
import type { LegendItem, MapLayout } from "@/lib/map/layout";
import { DEFAULT_VIEW, DIMS, DIM_KO, filterCount, inPeriod, MARK_PICKS, MAX_LEVELS, passes, PERIOD_KO, PERIODS, type Dim, type MarkPick, type ViewConfig, type ViewFilter } from "@/lib/map/view-config";

const MARK_CHIP: Record<MarkPick, string> = { interest: "내 관심", candidate: "적용 후보", hold: "보류" };
import { MapSearch, type FindHit } from "./map-search";

type ListKey = "kinds" | "fields" | "subs";
const LIST_DIM: Record<ListKey, Dim> = { kinds: "kind", fields: "field", subs: "sub" };
const sortKo = (a: string, b: string) => a.localeCompare(b, "ko");
/** 보기 창 펼침 기억(11-21 사용자 결정 F①: 다시 누를 때까지 펼친 채, 새로 고쳐도). 이 브라우저에만 */
const VIEW_OPEN_KEY = "techradar-map-view-open";

export function Toolbar({ nodes, view, projects, canMine, login, tagsFailed, onView, onReset, onFind, onGo }: {
  nodes: MapNode[]; view: ViewConfig; projects: { id: string; name: string }[]; canMine: boolean; login: boolean; tagsFailed?: boolean;
  onView: (v: ViewConfig) => void; onReset: () => void; onGo: (key: string) => void; onFind: (q: string) => FindHit[];
}) {
  const [viewOpen, setViewOpen] = useState(false), [filterOpen, setFilterOpen] = useState(false);
  useEffect(() => { try { setViewOpen(localStorage.getItem(VIEW_OPEN_KEY) === "1"); } catch { /* 저장소를 못 쓰면 닫힌 채로 */ } }, []);
  const toggleView = () => { setViewOpen(!viewOpen); try { localStorage.setItem(VIEW_OPEN_KEY, viewOpen ? "0" : "1"); } catch { /* 이번 화면에서만 */ } };
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
  // 태그는 대소문자를 같게 본다(passes와 같은 규칙). 주소로 온 태그도 끌 수 있게 목록에 넣는다
  const same = (a: string) => (b: string) => a.toLowerCase() === b.toLowerCase();
  const tags = [...f.tags, ...base.flatMap((x) => x.tags)].filter((t, i, all) => all.findIndex(same(t)) === i).sort(sortKo);
  const tagOn = (t: string) => f.tags.some(same(t));
  const toggleTag = (t: string) => setFilter({ tags: tagOn(t) ? f.tags.filter((x) => !same(t)(x)) : [...f.tags, t] });
  const box = (key: ListKey, v: string) => (
    <label key={v} className="check"><input type="checkbox" checked={f[key].includes(v)} onChange={() => toggleValue(key, v)} /> {v} <span className="muted">{count((x) => x.attrs[LIST_DIM[key]] === v)}</span></label>
  );

  return (
    <div className="map-hud">
      <MapSearch key={resets} onFind={onFind} login={login} projects={projects} onPick={(r) => { if (r.key) onGo(r.key); else onView({ ...view, scope: [r.scope!] }); }} />
      <div className="map-pop map-pop-view">
        <button type="button" className="btn" aria-expanded={viewOpen} onClick={toggleView}>보기</button>
        {viewOpen ? (
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
        <button type="button" className="btn" aria-expanded={filterOpen} onClick={() => setFilterOpen(!filterOpen)}>필터{n ? ` ${n}` : ""}</button>
        {filterOpen ? (
          <div className="map-pop-panel map-pop-top">
            <fieldset><legend>보안</legend>
              <label className="check"><input type="checkbox" checked={f.risky} onChange={(e) => setFilter({ risky: e.target.checked })} /> 위험·주의만 <span className="muted">{count((x) => x.grade === "danger" || x.grade === "caution")}</span></label>
              <label className="check"><input type="checkbox" checked={f.err} onChange={(e) => setFilter({ err: e.target.checked })} /> 수집 오류만 <span className="muted">{count((x) => !!x.collectErrorKind)}</span></label>
            </fieldset>
            <fieldset><legend>내 기술</legend>
              <label className="check"><input type="checkbox" checked={f.mineOnly} disabled={!canMine} onChange={(e) => setFilter({ mineOnly: e.target.checked })} /> 내 기술과 비교군(한 단계){canMine ? <span className="muted"> {count((x) => x.mine || x.nearMine)}</span> : " (로그인하고 프로젝트를 등록한 뒤)"}</label>
              {canMine && projects.length > 1 ? (
                <label>프로젝트 <select value={f.project} onChange={(e) => setFilter({ project: e.target.value })}>
                  <option value="">전체</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              ) : null}
            </fieldset>
            {login ? <fieldset><legend>내 태그</legend>
              {tagsFailed ? <p className="muted">내 태그를 읽지 못했어요(없다는 뜻이 아니에요).</p>
                : tags.length ? tags.map((t) => <label key={t} className="check"><input type="checkbox" checked={tagOn(t)} onChange={() => toggleTag(t)} /> {t} <span className="muted">{count((x) => x.tags.some(same(t)))}</span></label>)
                : <p className="muted">기술을 눌러 내 태그를 붙이면 여기서 거를 수 있어요.</p>}
            </fieldset> : null}
            <fieldset><legend>종류</legend>{values("kind").map((v) => box("kinds", v))}</fieldset>
            <fieldset><legend>하는 일</legend>{values("field").map((v) => (
              <div key={v}>{box("fields", v)}{f.fields.includes(v) ? (
                <div className="map-subf" role="group" aria-label={`${v}의 세부 갈래`}>{[...new Set(base.filter((x) => x.attrs.field === v).map((x) => x.attrs.sub))].sort(sortKo).map((s) => box("subs", s))}</div>
              ) : null}</div>
            ))}</fieldset>
            {n ? <button type="button" className="btn" onClick={() => onView({ ...view, filter: { ...DEFAULT_VIEW.filter } })}>필터 모두 끄기</button> : null}
          </div>
        ) : null}
      </div>
      <button type="button" className="btn" onClick={() => { setFilterOpen(false); setResets(resets + 1); onReset(); }}>보기 초기화</button>
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

/** 늘 보이는 빠른 칩(11-21 사용자: 필터를 보기 창 밖으로): 들어온 때(오늘 · 이번 주 · 이번 달) · 위험·주의 · 내 관심 · 내 기술과 비교군 · 수집 오류.
 *  다시 누르면 꺼진다. 수는 들어간 분류와 상관없이 지도 전체에서 센다 */
/** trendFailed = 요즘 뜨는 기술을 읽지 못함("없음"과 다르게 보인다) */
export function QuickChips({ nodes, view, canMine, login, trendFailed, onView, onReplay }: { nodes: MapNode[]; view: ViewConfig; canMine: boolean; login: boolean; trendFailed?: boolean; onView: (v: ViewConfig) => void; onReplay: () => void }) {
  const f = view.filter, set = (patch: Partial<ViewFilter>) => onView({ ...view, filter: { ...f, ...patch } });
  const count = (fn: (x: MapNode) => boolean) => nodes.filter(fn).length;
  // shortcut: "마지막 수집"은 정기 실행 기록(runs)을 읽어야 정확해서 아직 없음. 노드 하나의 확인 시각은 지도 전체가 최신인 것처럼 보이게 한다
  const errs = count((x) => !!x.collectErrorKind), hots = count((x) => x.hot);
  return (
    <>
      <span className="map-seg" role="group" aria-label="새 기술(들어온 때)">
        <span className="map-seg-label" aria-hidden="true">새 기술</span>
        {PERIODS.map((p) => { const n = count((x) => inPeriod(x, p)); return ( // 0개는 눌러도 빈 지도뿐이라 막는다(켜져 있으면 끌 수 있게 둠)
          <button key={p} type="button" className="chip" aria-pressed={f.period === p} disabled={!n && f.period !== p} onClick={() => set({ period: f.period === p ? "" : p })}>
            {PERIOD_KO[p]} <b>{n}</b>
          </button>
        ); })}
      </span>
      {count((x) => inPeriod(x, "week")) ? <button type="button" className="chip map-replay" onClick={onReplay}><span aria-hidden="true">▶</span> 새로 들어온 것 보기</button> : null}
      {trendFailed ? <span className="chip chip-note" role="status">요즘 뜨는 기술을 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요</span>
        : hots || f.hot ? <button type="button" className="chip" aria-pressed={f.hot} title="7일 사이 별이 크게 늘었거나 Hacker News에 오른 기술" onClick={() => set({ hot: !f.hot })}>요즘 뜨는 <b>{hots}</b></button>
        : null /* 0개면 숨긴다(빈 칩이 시연에서 비어 보이지 않게). 못 읽음은 위처럼 따로 알린다(불변 2) */}
      <button type="button" className="chip" aria-pressed={f.risky} onClick={() => set({ risky: !f.risky })}>위험·주의 <b>{count((x) => x.grade === "danger" || x.grade === "caution")}</b></button>
      {login ? <span className="map-seg" role="group" aria-label="내 판단">
        {MARK_PICKS.map((m) => { const on = f.marks.includes(m); return ( // 옛 보드의 칸(관심 · 적용 후보 · 보류)을 지도 칩으로(P-12f)
          <button key={m} type="button" className="chip" aria-pressed={on} onClick={() => set({ marks: on ? f.marks.filter((x) => x !== m) : [...f.marks, m] })}>
            {MARK_CHIP[m]} <b>{count((x) => x.mark?.status === m)}</b>
          </button>
        ); })}
      </span> : null}
      {canMine ? <button type="button" className="chip" aria-pressed={f.mineOnly} onClick={() => set({ mineOnly: !f.mineOnly })}>내 기술과 비교군 <b>{count((x) => x.mine || x.nearMine)}</b></button> : null}
      {errs > 0 || f.err ? <button type="button" className="chip" aria-pressed={f.err} onClick={() => set({ err: !f.err })}>수집 오류 <b>{errs}</b></button> : null}
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
