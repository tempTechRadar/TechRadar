"use client";
// 지도 왼쪽 필터 패널(P-12m Q2, 시안 "합본 · 지도" C 모양, 11-23 사용자 결정 · 점검 수정): 위 칩 줄을 한 줄로 줄이려고 옛 "필터" 창과 보기 묶음 탭을 여기로 모았다.
// 맨 위 저장한 보기(묶음 탭) → 프로젝트 · 내 태그 · 종류 · 하는 일(세부 갈래) 체크(색 기준인 값에는 점 색 = 범례). 보안 · 사용 중은 위 칩, 등급 표시 뜻은 지도 오른쪽 아래(P-12n).
// ‹로 접고, 접힘은 이 브라우저에만 기억(편의). 좁은 화면(≤860)은 처음에 접혀 있다
import { useEffect, useState, type ReactNode } from "react";
import type { MapNode } from "@/lib/map/build-map";
import type { MapLayout } from "@/lib/map/layout";
import { DEFAULT_VIEW, DIM_KO, filterCount, type Dim, type ViewConfig, type ViewFilter } from "@/lib/map/view-config";

type ListKey = "kinds" | "fields" | "subs";
const LIST_DIM: Record<ListKey, Dim> = { kinds: "kind", fields: "field", subs: "sub" };
const OPEN_KEY = "techradar-map-filter-open";
const sortKo = (a: string, b: string) => a.localeCompare(b, "ko");

type Props = {
  L: MapLayout; nodes: MapNode[]; view: ViewConfig; projects: { id: string; name: string }[]; canMine: boolean; login: boolean; tagsFailed?: boolean;
  onView: (v: ViewConfig) => void; saved: ReactNode;
};

export function FilterPanel({ L, nodes, view, projects, canMine, login, tagsFailed, onView, saved }: Props) {
  const [open, setOpen] = useState(true);
  useEffect(() => { // 브라우저 기억은 붙은 뒤에 읽는다(서버 첫 화면과 같게)
    let s: string | null = null;
    try { s = localStorage.getItem(OPEN_KEY); } catch { /* 저장소를 못 쓰면 기본 */ }
    setOpen(s ? s === "1" : !matchMedia("(max-width: 860px)").matches);
  }, []);
  const toggle = () => { const next = !open; setOpen(next); try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch { /* 이번 화면에서만 */ } };
  const f = view.filter, n = filterCount(view);
  const setFilter = (patch: Partial<ViewFilter>) => onView({ ...view, filter: { ...f, ...patch } });
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
  // 색 기준인 값은 점 색을 함께(아래 범례 줄을 대신함)
  const dot = (key: ListKey, v: string) => {
    const l = LIST_DIM[key] === L.color ? L.legend.find((x) => x.value === v) : undefined;
    return l ? <i className="map-dot" aria-hidden="true" style={l.hollow ? { border: `2px solid var(${l.token})` } : { background: `var(${l.token})` }} /> : null;
  };
  const box = (key: ListKey, v: string) => (
    <label key={v}><input type="checkbox" checked={f[key].includes(v)} onChange={() => toggleValue(key, v)} />{dot(key, v)}<span>{v}</span><b>{count((x) => x.attrs[LIST_DIM[key]] === v)}</b></label>
  );
  return (
    <section className="map-filter" data-open={open ? "" : undefined} aria-label="필터">
      <button type="button" className="map-filter-toggle" aria-expanded={open} onClick={toggle} aria-label={open ? "필터 접기" : "필터 펼치기"}>
        <span>필터{n ? <b> {n}</b> : null}</span><span aria-hidden="true">{open ? "‹" : "›"}</span>
      </button>
      {open ? (
        <div className="map-filter-body">
          <div className="map-filter-saved" role="group" aria-label="저장한 보기"><span className="map-filter-head">저장한 보기</span>{saved}</div>
          {Object.values(LIST_DIM).includes(L.color) ? null : ( // 색 기준이 체크 목록에 없는 값(등급 · 쓰는 곳 · 프로젝트)이면 범례만
            <fieldset><legend>색 = {DIM_KO[L.color]}</legend>{L.legend.map((l) => (
              <span key={l.value} className="map-filter-row"><i className="map-dot" aria-hidden="true" style={l.hollow ? { border: `2px solid var(${l.token})` } : { background: `var(${l.token})` }} /><span>{l.value}</span><b>{l.count}</b></span>
            ))}</fieldset>
          )}
          {canMine && projects.length > 1 ? ( // 보안 · 사용 중은 위 칩과 같은 일이라 패널에서 뺌(P-12n), 프로젝트 고르기만
            <fieldset><legend>프로젝트</legend>
              <label className="map-filter-select"><span className="sr-only">프로젝트</span><select value={f.project} onChange={(e) => setFilter({ project: e.target.value })}>
                <option value="">전체</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            </fieldset>
          ) : null}
          {login ? <fieldset><legend>내 태그</legend>
            {tagsFailed ? <p className="muted">내 태그를 불러오지 못했어요(없다는 뜻이 아니에요).</p>
              : tags.length ? tags.map((t) => <label key={t}><input type="checkbox" checked={tagOn(t)} onChange={() => toggleTag(t)} /><span>{t}</span><b>{count((x) => x.tags.some(same(t)))}</b></label>)
              : <p className="muted">기술을 눌러 내 태그를 붙이면 여기서 필터할 수 있어요.</p>}
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
    </section>
  );
}
