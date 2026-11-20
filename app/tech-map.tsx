"use client";
// 첫 화면 기술 지도(PRD-F23, IA-10). 레이더 고리 위에 사용자가 고른 기준으로 1~3차 묶음과 기술을 놓는다(lib/map/layout.ts).
// 올리면 이어진 것(위아래 단계·비교군)만 진하게, 누르면 지도 위에 사이드바를 덮는다(지도 크기는 그대로). 키보드: Tab, Enter, Esc.
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MapNode, TechMapModel } from "@/lib/map/build-map";
import { connected, FIRST_RING, layoutMap, LEVEL_GAP, type GroupNode, type Leaf, type MapLayout } from "@/lib/map/layout";
import { DEFAULT_VIEW } from "@/lib/map/view-config";
import { MapControls } from "./map-controls";
import { GroupCard, GroupPanel, Legend, SEC, TechCard, TechPanel } from "./map-panels";
import { useMapView } from "./use-map-view";

const SHAPE_R = [22, 15, 10];
const pressKey = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
const shape = (level: number, r: number) => level === 1
  ? Array.from({ length: 6 }, (_, i) => { const a = Math.PI / 6 + (i * Math.PI) / 3; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`; }).join(" ")
  : level === 2 ? `0,${-r} ${r},0 0,${r} ${-r},0` : `${-r},${-r} ${r},${-r} ${r},${r} ${-r},${r}`;
const findNode = (nodes: MapNode[], q: string) => {
  const t = q.trim().toLowerCase();
  return t ? nodes.find((x) => x.name.toLowerCase() === t) ?? nodes.find((x) => x.name.toLowerCase().includes(t)) : undefined;
};

/** canSave: 보기 설정을 이 브라우저에 기억할지(로그인했을 때만) */
type Props = { model: TechMapModel; projects: { id: string; name: string }[]; initialQuery: string; canSave: boolean };
type Tip = { id: string; x: number; y: number } | null;

export function TechMap({ model, projects, initialQuery, canSave }: Props) {
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);
  const { view, setView } = useMapView(initialQuery, model, projectIds, canSave);
  const [hover, setHover] = useState<Tip>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [pan, setPan] = useState(0);
  const stage = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), side = useRef<HTMLElement>(null);
  const layout = useMemo(() => layoutMap(model, view), [model, view]);
  const lit = useMemo(() => (hover?.id ?? sel ? connected(layout, (hover?.id ?? sel)!) : null), [layout, hover, sel]);

  const changeView = (v: typeof view) => { setView(v); setSel(null); setPan(0); };
  function open(id: string) {
    setSel(id); setHover(null);
    requestAnimationFrame(() => {
      document.getElementById("map-side-title")?.focus({ preventScroll: true }); // 초점을 옮길 때 화면이 따라 밀리지 않게
      const el = svg.current?.querySelector(`[data-id="${CSS.escape(id)}"]`), s = side.current?.getBoundingClientRect(), ctm = svg.current?.getScreenCTM();
      if (!el || !s || !ctm) return;
      const r = el.getBoundingClientRect();
      if (r.right > s.left - 24) setPan((p) => p + (r.right - s.left + 80) / ctm.a); // 지금 옮겨진 만큼에 더한다(사이드바에서 다른 점을 골라도 가려지지 않게)
    });
  }
  function close() {
    const was = sel;
    setSel(null); setPan(0);
    if (was) requestAnimationFrame(() => (svg.current?.querySelector(`[data-id="${CSS.escape(was)}"]`) as HTMLElement | null)?.focus({ preventScroll: true }));
  }
  function showTip(id: string, el: Element | null) {
    const s = stage.current?.getBoundingClientRect(), r = el?.getBoundingClientRect();
    setHover(s && r ? { id, x: Math.min(r.right - s.left + 8, s.width - 300), y: r.top - s.top - 8 } : null);
  }
  function search(q: string) {
    const n = findNode(model.nodes, q);
    if (!n) return;
    if (!layout.leaves.some((l) => l.node.key === n.key)) changeView({ ...view, filter: DEFAULT_VIEW.filter }); // 거르기에 숨은 기술이면 거르기를 푼다
    requestAnimationFrame(() => open(n.key));
  }

  return (
    <div className={`map-stage${sel ? " open" : ""}`} ref={stage} onKeyDown={(e) => { if (e.key === "Escape") { setHover(null); close(); } }}>
      <div className="map-hud"><MapControls model={model} projects={projects} view={view} shown={layout.shown} onView={changeView} onSearch={search} /></div>
      <div className="map-canvas">
        <MapSvg layout={layout} model={model} pan={pan} sel={sel} lit={lit} svgRef={svg} onOpen={open} onTip={showTip} />
        {layout.shown === 0 ? <p className="map-empty notice" role="status">이 보기의 거르기에 맞는 기술이 없어요. <button type="button" className="btn" onClick={() => changeView(DEFAULT_VIEW)}>보기 처음대로</button></p> : null}
      </div>
      <Legend items={layout.legend} view={view} mine={model.mode === "mine"} />
      <HoverCard layout={layout} hover={hover} />
      <aside className="map-side" ref={side} aria-label="고른 것" inert={!sel}>
        <SideContent layout={layout} sel={sel} onPick={open} onClose={close} />
      </aside>
    </div>
  );
}

type SvgProps = { layout: MapLayout; model: TechMapModel; pan: number; sel: string | null; lit: Set<string> | null; svgRef: React.RefObject<SVGSVGElement | null>; onOpen: (id: string) => void; onTip: (id: string, el: Element | null) => void };

// 지도 그림: 레이더 배경 → 단계 선 → 비교군 선 → 묶음 → 기술 점
function MapSvg({ layout, model, pan, sel, lit, svgRef, onOpen, onTip }: SvgProps) {
  const at = useMemo(() => new Map<string, { x: number; y: number }>([...layout.groups.map((g) => [g.id, g] as const), ...layout.leaves.map((l) => [l.node.key, l] as const)]), [layout]);
  const dim = (id: string) => (lit && !lit.has(id) ? " dim" : "");
  const many = layout.leaves.length > 60, R = layout.radius;
  return (
    <svg ref={svgRef} viewBox={`${-R - 60 + pan} ${-R - 30} ${2 * R + 260} ${2 * R + 60}`} role="group"
      aria-label={`기술 지도: 기술 ${layout.shown}개, ${layout.groups.filter((g) => g.level === 1).length}개 묶음. 점에 올리면 카드, 누르면 오른쪽에 설명이 열려요`}>
      <Radar radius={R} depth={layout.groups.reduce((d, g) => Math.max(d, g.level), 0)} />
      {[...layout.groups, ...layout.leaves].map((c) => {
        const id = "id" in c ? c.id : c.node.key, p = (c.parent && at.get(c.parent)) || { x: 0, y: 0 };
        return <line key={`t:${id}`} x1={p.x} y1={p.y} x2={c.x} y2={c.y} className={`tree${lit?.has(id) && (!c.parent || lit.has(c.parent)) ? " on" : ""}${dim(id)}`} />;
      })}
      {layout.compareEdges.map(([a, b]) => {
        const pa = at.get(a)!, pb = at.get(b)!, on = lit?.has(a) && lit?.has(b);
        return <line key={`c:${a}|${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={`cmp${on ? " on" : ""}${lit && !on ? " dim" : ""}`} />;
      })}
      <text y={6} textAnchor="middle" className="me">{model.mode === "mine" ? "나" : "모은 기술"}</text>
      {layout.groups.map((g) => <Hub key={g.id} g={g} cls={dim(g.id)} sel={sel === g.id} onOpen={() => onOpen(g.id)} onTip={(el) => onTip(g.id, el)} />)}
      {layout.leaves.map((l) => <Dot key={l.node.key} l={l} cls={dim(l.node.key)} sel={sel === l.node.key} onOpen={() => onOpen(l.node.key)} onTip={(el) => onTip(l.node.key, el)}
        showLabel={!many || l.node.mine || l.node.grade === "danger" || l.node.grade === "caution" || l.node.isNew || !!lit?.has(l.node.key)} />)}
    </svg>
  );
}

function HoverCard({ layout, hover }: { layout: MapLayout; hover: Tip }) {
  if (!hover) return null;
  const g = layout.groups.find((x) => x.id === hover.id), l = layout.leaves.find((x) => x.node.key === hover.id);
  return g ? <GroupCard g={g} x={hover.x} y={hover.y} /> : l ? <TechCard n={l.node} x={hover.x} y={hover.y} /> : null;
}

function SideContent({ layout, sel, onPick, onClose }: { layout: MapLayout; sel: string | null; onPick: (id: string) => void; onClose: () => void }) {
  const inSel = useMemo(() => (sel ? connected(layout, sel) : new Set<string>()), [layout, sel]); // 한 번만 계산(묶음 패널의 기술 목록)
  if (!sel) return null;
  const g = layout.groups.find((x) => x.id === sel), leaf = layout.leaves.find((x) => x.node.key === sel);
  if (g) return <GroupPanel g={g} members={layout.leaves.filter((l) => inSel.has(l.node.key)).map((l) => l.node)} onPick={onPick} onClose={onClose} />;
  if (!leaf) return null;
  const byKey = new Map(layout.leaves.map((l) => [l.node.key, l.node]));
  const compare = layout.compareEdges.filter((e) => e.includes(sel)).map(([a, b]) => byKey.get(a === sel ? b : a)!);
  return <TechPanel n={leaf.node} compare={compare} onPick={onPick} onClose={onClose} />;
}

// 레이더 배경: 단계마다 고리, 십자선. 움직이는 선은 나중에(실제 실행 기록과 이어질 때, 불변 6)
function Radar({ radius, depth }: { radius: number; depth: number }) {
  const rings = [...Array.from({ length: depth }, (_, i) => FIRST_RING + i * LEVEL_GAP), radius - 20];
  return (
    <g className="radar" aria-hidden="true">
      <circle r={radius} className="disc" />
      {rings.map((r) => <circle key={r} r={r} className="ring" />)}
      <line x1={-radius} y1={0} x2={radius} y2={0} className="cross" /><line x1={0} y1={-radius} x2={0} y2={radius} className="cross" />
    </g>
  );
}

function Hub({ g, cls, sel, onOpen, onTip }: { g: GroupNode; cls: string; sel: boolean; onOpen: () => void; onTip: (el: Element | null) => void }) {
  const r = SHAPE_R[g.level - 1] ?? 9, out = Math.atan2(g.y, g.x), lx = Math.cos(out) * (r + 8), ly = Math.sin(out) * (r + 8);
  return (
    <g data-id={g.id} className={`hub l${g.level}${cls}${sel ? " sel" : ""}`} transform={`translate(${g.x} ${g.y})`} role="button" tabIndex={0}
      aria-label={`${g.level}차 묶음 ${g.value}, 기술 ${g.count}${g.danger ? `, 위험 ${g.danger}` : ""}${g.caution ? `, 주의 ${g.caution}` : ""}`}
      onClick={onOpen} onKeyDown={pressKey(onOpen)} onMouseEnter={(e) => onTip(e.currentTarget)} onMouseLeave={() => onTip(null)} onFocus={(e) => onTip(e.currentTarget)} onBlur={() => onTip(null)}>
      <polygon points={shape(g.level, r)} style={g.color ? { fill: g.color, stroke: g.color } : undefined} className={g.color ? "colored" : ""} />
      <text x={lx} y={ly + 5} textAnchor={g.x >= 0 ? "start" : "end"} className="hub-name">{g.value} <tspan className="count">{g.count}</tspan></text>
      {g.danger ? <g transform={`translate(${r * 0.7} ${-r * 0.9})`}><circle r={7} className="badge-danger" /><text y={4} textAnchor="middle" className="badge-sym">✕</text></g> : null}
    </g>
  );
}

// 기술 점: 색 = 색 기준 값, 진한 테두리 = 내 기술, 옅은 점 = 비교군. 위험 ✕(깜박임)·주의 !·수집 오류 점선·NEW 표
function Dot({ l, cls, sel, showLabel, onOpen, onTip }: { l: Leaf; cls: string; sel: boolean; showLabel: boolean; onOpen: () => void; onTip: (el: Element | null) => void }) {
  const n = l.node, r = n.mine ? 8 : 6.5, sec = n.grade === "danger" || n.grade === "caution" ? SEC[n.grade] : null;
  return (
    <g data-id={n.key} className={`dot${cls}${sel ? " sel" : ""}`} transform={`translate(${l.x} ${l.y})`} role="button" tabIndex={0}
      aria-label={`${n.name}, ${n.mine ? "내 기술" : "비교군"}, ${n.attrs.field}, ${SEC[n.grade].ko}${n.isNew ? ", NEW" : ""}${n.collectErrorKind ? ", 수집 오류" : ""}`}
      onClick={onOpen} onKeyDown={pressKey(onOpen)} onMouseEnter={(e) => onTip(e.currentTarget)} onMouseLeave={() => onTip(null)} onFocus={(e) => onTip(e.currentTarget)} onBlur={() => onTip(null)}>
      <circle r={r + 9} className="hit" />
      {n.grade === "danger" ? <circle r={r + 5} className="pulse" /> : null}
      {n.collectErrorKind ? <circle r={r + 4} className="err-ring" /> : null}
      <circle r={r} fill={l.color} className={n.mine ? "mine" : "other"} />
      {sec ? <g transform={`translate(${r} ${-r - 2})`}><circle r={6.5} style={{ fill: sec.color }} /><text y={4} textAnchor="middle" className="badge-sym">{sec.sym}</text></g> : null}
      {n.isNew ? <g transform={`translate(${-r - 24} ${-r - 10})`}><rect width={24} height={12} rx={3} className="new-tag" /><text x={12} y={9.5} textAnchor="middle" className="new-text">NEW</text></g> : null}
      {showLabel ? <text x={l.x >= 0 ? r + 6 : -r - 6} y={5} textAnchor={l.x >= 0 ? "start" : "end"} className="name">{n.name}</text> : null}
    </g>
  );
}
