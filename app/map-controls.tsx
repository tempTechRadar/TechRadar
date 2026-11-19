"use client";
// 지도 위 도구 줄: 찾기와 "보기" 설정(노션처럼 1~3차 묶기 · 색 기준 · 거르기). 바꾸면 주소와 이 브라우저에 남는다(tech-map.tsx).
import type { FormEvent } from "react";
import type { MapNode, TechMapModel } from "@/lib/map/build-map";
import { DEFAULT_VIEW, DIMS, DIM_KO, MAX_LEVELS, type Dim, type ViewConfig } from "@/lib/map/view-config";

type Props = { model: TechMapModel; projects: { id: string; name: string }[]; view: ViewConfig; shown: number; onView: (v: ViewConfig) => void; onSearch: (q: string) => void };

const valuesOf = (nodes: MapNode[], dim: Dim) => [...new Set(nodes.map((n) => n.attrs[dim]))].sort((a, b) => a.localeCompare(b, "ko"));

export function MapControls({ model, projects, view, shown, onView, onSearch }: Props) {
  const f = view.filter;
  const setFilter = (patch: Partial<ViewConfig["filter"]>) => onView({ ...view, filter: { ...f, ...patch } });
  // n차를 고르면 그 아래 단계는 새로 고른다. "없음"이면 거기서 끊는다.
  // 색은 사용자가 따로 고른 것이면 그대로 두고, 1차를 따라가던 기본값일 때만 새 1차를 따라간다
  const setLevel = (i: number, dim: Dim | "") => {
    const group = dim ? [...view.group.slice(0, i), dim] : view.group.slice(0, i);
    onView({ ...view, group, color: view.color === view.group[0] ? group[0] ?? view.color : view.color });
  };
  const filters = [f.kinds.length, f.fields.length, f.risky, f.mineOnly, f.newOnly, f.project].filter(Boolean).length;
  const summary = `${view.group.map((d) => DIM_KO[d]).join(" › ") || "묶지 않음"} · 색 ${DIM_KO[view.color]}${filters ? ` · 거르기 ${filters}` : ""}`;

  return (
    <>
      <SearchBox nodes={model.nodes} onSearch={onSearch} />
      <details className="map-view">
        <summary>보기: {summary}</summary>
        <div className="map-view-panel">
          <fieldset>
            <legend>묶기(안쪽 고리부터)</legend>
            {Array.from({ length: Math.min(MAX_LEVELS, view.group.length + 1) }, (_, i) => (
              <label key={i}>{i + 1}차 <select value={view.group[i] ?? ""} onChange={(e) => setLevel(i, e.target.value as Dim | "")}>
                <option value="">없음</option>
                {DIMS.filter((d) => !view.group.slice(0, i).includes(d)).map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}
              </select></label>
            ))}
          </fieldset>
          <fieldset>
            <legend>색</legend>
            <label>색 기준 <select value={view.color} onChange={(e) => onView({ ...view, color: e.target.value as Dim })}>
              {DIMS.map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}
            </select></label>
          </fieldset>
          <fieldset>
            <legend>거르기</legend>
            <label>종류 <select value={f.kinds[0] ?? ""} onChange={(e) => setFilter({ kinds: e.target.value ? [e.target.value] : [] })}>
              <option value="">전체</option>{valuesOf(model.nodes, "kind").map((v) => <option key={v}>{v}</option>)}
            </select></label>
            <label>하는 일 <select value={f.fields[0] ?? ""} onChange={(e) => setFilter({ fields: e.target.value ? [e.target.value] : [] })}>
              <option value="">전체</option>{valuesOf(model.nodes, "field").map((v) => <option key={v}>{v}</option>)}
            </select></label>
            {model.mode === "mine" && projects.length > 1 ? (
              <label>프로젝트 <select value={f.project} onChange={(e) => setFilter({ project: e.target.value })}>
                <option value="">전체</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            ) : null}
            <label className="check"><input type="checkbox" checked={f.risky} onChange={(e) => setFilter({ risky: e.target.checked })} /> 위험·주의만</label>
            <label className="check"><input type="checkbox" checked={f.newOnly} onChange={(e) => setFilter({ newOnly: e.target.checked })} /> NEW만</label>
            {model.mode === "mine" ? <label className="check"><input type="checkbox" checked={f.mineOnly} onChange={(e) => setFilter({ mineOnly: e.target.checked })} /> 내 기술만</label> : null}
          </fieldset>
          <p className="muted" role="status">보이는 기술 {shown} / {model.nodes.length}</p>
          <button type="button" className="btn" onClick={() => onView(DEFAULT_VIEW)}>보기 처음대로</button>
        </div>
      </details>
    </>
  );
}

// 찾기: 고르거나 Enter를 누를 때만 연다(글자를 치는 동안 이름이 맞아도 열지 않는다: 초점이 빠져 나머지 글자가 사라짐)
function SearchBox({ nodes, onSearch }: { nodes: MapNode[]; onSearch: (q: string) => void }) {
  const submit = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); onSearch(new FormData(e.currentTarget).get("q") as string); };
  return (
    <form className="map-search" role="search" onSubmit={submit}>
      <label htmlFor="map-q" className="sr-only">기술 찾기</label>
      <input id="map-q" name="q" list="map-names" placeholder="기술 찾기" autoComplete="off"
        onInput={(e) => { if ((e.nativeEvent as InputEvent).inputType === "insertReplacementText") onSearch(e.currentTarget.value); }} />
      <datalist id="map-names">{nodes.map((n) => <option key={n.key} value={n.name} />)}</datalist>
      <button type="submit" className="btn">찾기</button>
    </form>
  );
}
