"use client";
// 지도 도구(시안 radar.html·radar-ui.js, P-12m 점검으로 자리 옮김): 위 한 줄 = 찾기 + 경로 칩 + 빠른 칩, 필터는 왼쪽 패널(filter-panel), 보기 · 보기 초기화는 오른쪽 아래.
// 그 아래 경로 칩(이 분류만 보기)과 늘 보이는 빠른 칩(들어온 때 · 위험 · 관심 · 내 기술), 지도 아래 범례·상태 줄. 단추는 최소로(사용자 11-20).
import type { MapNode } from "@/lib/map/build-map";
import type { MapLayout } from "@/lib/map/layout";
import { DIMS, DIM_KO, inPeriod, MARK_PICKS, MAX_LEVELS, NEW_QUOTA, passes, PERIOD_KO, PERIODS, type Dim, type MarkPick, type ViewConfig, type ViewFilter } from "@/lib/map/view-config";

const MARK_CHIP: Record<MarkPick, string> = { interest: "★ 관심", candidate: "담은 기술", hold: "보류" }; // 사이드 패널 별 · 담기와 같은 말(P-12h U1)


/** 필터 패널 맨 위 "보기 방식"(P-12p 사용자: 보기 · 보기 초기화를 필터 사이드바 안으로): 묶기 1~3단계 · 색 + [보기 초기화] */
export function ViewTools({ view, canMine, onView, onReset }: { view: ViewConfig; canMine: boolean; onView: (v: ViewConfig) => void; onReset: () => void }) {
  const setLevel = (i: number, dim: Dim | "") => {
    const group = dim ? [...view.group.slice(0, i), dim] : view.group.slice(0, i);
    onView({ ...view, group, color: view.color === view.group[0] ? group[0] ?? view.color : view.color });
  };
  return (
    <fieldset className="map-view-tools"><legend>보기 방식</legend>
      {Array.from({ length: Math.min(MAX_LEVELS, view.group.length + 1) }, (_, i) => (
        <label key={i} className="map-filter-select">{i + 1}단계 <select value={view.group[i] ?? ""} onChange={(e) => setLevel(i, e.target.value as Dim | "")}>
          <option value="">없음</option>
          {DIMS.filter((d) => !view.group.slice(0, i).includes(d) && (d !== "project" || canMine)).map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}
        </select></label>
      ))}
      <label className="map-filter-select">색 <select value={view.color} onChange={(e) => onView({ ...view, color: e.target.value as Dim })}>
        {DIMS.filter((d) => d !== "project" || canMine).map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}
      </select></label>
      <button type="button" className="btn" onClick={onReset}>보기 초기화</button>
    </fieldset>
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

/** 늘 보이는 빠른 칩(11-21 사용자: 필터를 보기 창 밖으로, P-12m 시안 A 순서): 들어온 때(오늘 · 이번 주 · 이번 달) · 위험·주의 · 내 관심 · 사용 중 · 수집 오류, 그 뒤 다시 보기 · 요즘 뜨는. 옛 말: 내 기술과 비교군 · 수집 오류.
 *  다시 누르면 꺼진다. 수는 들어간 분류와 상관없이 지도 전체에서 센다 */
/** trendFailed = 요즘 뜨는 기술을 읽지 못함("없음"과 다르게 보인다) */
export function QuickChips({ nodes, view, canMine, login, trendFailed, onView, onReplay }: { nodes: MapNode[]; view: ViewConfig; canMine: boolean; login: boolean; trendFailed?: boolean; onView: (v: ViewConfig) => void; onReplay: () => void }) {
  const f = view.filter, set = (patch: Partial<ViewFilter>) => onView({ ...view, filter: { ...f, ...patch } });
  const count = (fn: (x: MapNode) => boolean) => nodes.filter(fn).length;
  // shortcut: "마지막 수집"은 정기 실행 기록(runs)을 읽어야 정확해서 아직 없음. 노드 하나의 확인 시각은 지도 전체가 최신인 것처럼 보이게 한다
  const errs = count((x) => !!x.collectErrorKind), hots = count((x) => x.hot), risky = count((x) => x.grade === "danger" || x.grade === "caution");
  return (
    <>
      {/* P-12y M3: 이 수는 지도에 올린 기술만 센다(새 기술은 최근 NEW_QUOTA개까지). 프로젝트 화면 "오늘의 새 기술"은 들어온 전체 수 */}
      <span className="map-seg" role="group" aria-label="지도에 보이는 새 기술(들어온 때)" title={`지도에 보이는 기술만 세요(새 기술은 최근 ${NEW_QUOTA}개까지). 프로젝트 화면의 "오늘의 새 기술"은 들어온 전체 수예요.`}>
        <span className="map-seg-label" aria-hidden="true">새 기술</span>
        {PERIODS.map((p) => { const n = count((x) => inPeriod(x, p)); return ( // 0개는 눌러도 빈 지도뿐이라 막는다(켜져 있으면 끌 수 있게 둠)
          <button key={p} type="button" className="chip" aria-pressed={f.period === p} disabled={!n && f.period !== p} onClick={() => set({ period: f.period === p ? "" : p })}>
            {PERIOD_KO[p]} <b>{n}</b>
          </button>
        ); })}
      </span>
      {risky || f.risky ? <button type="button" className="chip" data-tone="caution" aria-pressed={f.risky} onClick={() => set({ risky: !f.risky })}>위험·주의 <b>{risky}</b></button> : null /* 0이면 숨김(P-12n) */}
      {login ? <span className="map-seg" role="group" aria-label="내 판단">
        {MARK_PICKS.map((m) => { const on = f.marks.includes(m); return ( // 옛 보드의 칸(관심 · 적용 후보 · 보류)을 지도 칩으로(P-12f)
          <button key={m} type="button" className="chip" aria-pressed={on} onClick={() => set({ marks: on ? f.marks.filter((x) => x !== m) : [...f.marks, m] })}>
            {MARK_CHIP[m]} <b>{count((x) => x.decided === m)}</b>
          </button>
        ); })}
      </span> : null}
      {canMine ? <button type="button" className="chip" data-tone="mine" aria-pressed={f.mineOnly} onClick={() => set({ mineOnly: !f.mineOnly })}>사용 중 <b>{count((x) => x.mine)}</b></button> : null}
      {errs > 0 || f.err ? <button type="button" className="chip" data-tone="err" aria-pressed={f.err} onClick={() => set({ err: !f.err })}>수집 오류 기술 <b>{errs}</b></button> : null}
      {count((x) => inPeriod(x, "week")) ? <button type="button" className="chip map-replay" onClick={onReplay}><span aria-hidden="true">▶</span> 새로 들어온 것 보기</button> : null}
      {trendFailed ? <span className="chip chip-note" role="status">요즘 뜨는 기술을 불러오지 못했어요. 잠시 뒤 새로 고쳐 주세요</span>
        : hots || f.hot ? <button type="button" className="chip" aria-pressed={f.hot} title="7일 사이 별이 크게 늘었거나 Hacker News에 오른 기술" onClick={() => set({ hot: !f.hot })}>요즘 뜨는 <b>{hots}</b></button>
        : null /* 0개면 숨긴다(빈 칩이 시연에서 비어 보이지 않게). 못 읽음은 위처럼 따로 알린다(불변 2) */}
    </>
  );
}

export function Status({ L, collapsed, nodes, view }: { L: MapLayout; collapsed: number; nodes: MapNode[]; view: ViewConfig }) {
  const shown = nodes.filter((x) => passes(x, view));
  const d = shown.filter((x) => x.grade === "danger").length, w = shown.filter((x) => x.grade === "caution").length, e = shown.filter((x) => x.collectErrorKind).length;
  // 기간 보기(옛 /new 포함)는 지도에 올린 최근 새 기술 안에서만 보인다: 전부처럼 보이지 않게 한 줄(P-12f)
  const capped = view.filter.period ? ` · 새 기술은 지도에 올린 최근 ${NEW_QUOTA}개 안에서만 보여요` : "";
  return <p className="map-status" role="status">보이는 기술 {L.shown} / 지도에 올린 기술 {L.total}{collapsed ? ` · 접힌 묶음 ${collapsed}` : ""} · 위험 {d} · 주의 {w}{e ? ` · 수집 오류 ${e}(점선 고리)` : ""}{capped}</p>;
}
