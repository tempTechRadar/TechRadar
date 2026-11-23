"use client";
// 프로젝트 관리 보드 캔버스(P-12i D1 · P-12k K1 타공보드): 걸린 판 = React Flow 노드, 한 줄 24px · 한 칸 폭 = 판 폭 ÷ 48(861~1199px에서도 안 잘림). 배치는 이 브라우저에만(localStorage, DB 0).
// 보기 모드: 확대 1 고정 · 끌기 없음 · 휠은 페이지 스크롤. "배치 바꾸기"를 켜면 끌기 · 크기(NodeResizer) · 키보드(화살표 이동, Shift+화살표 크기, Delete 빼기).
// 좁은 화면(≤860)은 캔버스를 끄고 배치 차례(y → x)대로 한 줄. 위젯 본문은 nodrag nowheel(폼 · 스크롤이 캔버스 끌기와 겹치지 않게).
import { applyNodeChanges, NodeResizer, ReactFlow, type Node, type NodeChange, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { boardHeight, CELL, COLS, defaultLayout, MIN_H, MIN_W, parseLayout, pushDown, reveal, snapBox, stackOrder, type Box } from "@/lib/dashboard/board-layout";

export type Widget = { id: string; title: string; body: ReactNode };
type WData = { w: Widget; cw: number; edit: boolean; folded: boolean; onFold: () => void; onMax: () => void; onHide: () => void; onResized: (b: { x: number; y: number; width: number; height: number }) => void };
type WNode = Node<WData, "widget">;

const NARROW = "(max-width: 860px)";
const onNarrow = (f: () => void) => { const m = matchMedia(NARROW); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };
const useNarrow = () => useSyncExternalStore(onNarrow, () => matchMedia(NARROW).matches, () => false);
const TITLE_H = 2; // 접은 위젯 높이(칸)
// 판 밖 링크가 가리키는 자리 → 그 자리가 든 판(판을 빼도 링크가 깨지지 않게 reveal). #w-<id>는 그 판
const HOME: Record<string, string> = { "repo-register": "repos", "add-title": "add", techs: "repos" };
const hashPanel = (h: string) => (h.startsWith("w-") ? h.slice(2) : HOME[h]);

/** 위젯 틀: 제목 막대(이름 · 접기 · 최대화 · ⋯) + 본문. 편집 모드면 크기 손잡이 */
function Frame({ w, edit, folded, onFold, onMax, onHide, children }: Omit<WData, "onResized" | "cw"> & { children?: ReactNode }) {
  const [menu, setMenu] = useState(false);
  return (
    <section className="bw" id={`w-${w.id}`} aria-labelledby={`bw-${w.id}`} data-folded={folded ? "" : undefined}>
      <header className="bw-bar">
        <h2 id={`bw-${w.id}`} className="bw-title">{w.title}</h2>
        <span className="bw-tools nodrag">
          <button type="button" className="bw-tool" aria-expanded={!folded} aria-label={`${w.title} ${folded ? "펼치기" : "접기"}`} onClick={onFold}>{folded ? "▸" : "▾"}</button>
          <button type="button" className="bw-tool" aria-label={`${w.title} 크게 보기`} onClick={onMax}>⤢</button>
          <span className="bw-menuwrap">
            <button type="button" className="bw-tool" aria-expanded={menu} aria-label={`${w.title} 더 보기`} onClick={() => setMenu(!menu)}>⋯</button>
            {menu ? <span className="bw-menu" onKeyDown={(e) => { if (e.key === "Escape") setMenu(false); }}>
              <button type="button" className="bw-menuitem" onClick={() => { setMenu(false); onHide(); }}>이 판 빼기</button>
            </span> : null}
          </span>
        </span>
      </header>
      {folded ? null : <div className="bw-body nodrag nowheel">{children ?? w.body}</div>}
    </section>
  );
}

function WidgetNode({ data, selected }: NodeProps<WNode>) {
  return (
    <>
      {data.edit && !data.folded ? <NodeResizer minWidth={MIN_W * data.cw} minHeight={MIN_H * CELL} isVisible={selected || data.edit} lineClassName="bw-resize-line" handleClassName="bw-resize-handle"
        onResizeEnd={(_, p) => data.onResized(p)} /> : null}
      <Frame {...data} />
    </>
  );
}
const nodeTypes = { widget: WidgetNode };

/** storeKey = localStorage 키(project-board-v1:<프로필 id 앞 8자>, 손님은 :guest) */
export function Board({ widgets, storeKey }: { widgets: Widget[]; storeKey: string }) {
  const ids = useMemo(() => widgets.map((w) => w.id), [widgets]);
  const [layout, setLayout] = useState<Box[]>(() => defaultLayout(ids));
  useEffect(() => { // 서버 그림과 같게 기본 배치로 그린 뒤 이 브라우저 배치를 읽는다(하이드레이션 어긋남 없게). 주소가 가리키는 판이 빠져 있으면 다시 건다
    const go = (base?: Box[]) => {
      const h = decodeURIComponent(location.hash.slice(1)), id = hashPanel(h);
      setLayout((l) => (id ? reveal(base ?? l, id) : base ?? l));
      if (id) setTimeout(() => (document.getElementById(h) ?? document.getElementById(`w-${id}`))?.scrollIntoView(), 50); // 다시 건 판이 그려진 뒤
    };
    let saved = defaultLayout(ids);
    try { saved = parseLayout(localStorage.getItem(storeKey), ids); } catch { /* 저장소를 막은 브라우저: 기본 배치 */ }
    go(saved);
    const onHash = () => go();
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, [storeKey, ids]);
  const save = (next: Box[]) => { setLayout(next); try { localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* 저장 못 해도 이번 화면에선 그대로 */ } };
  const [edit, setEdit] = useState(false), [folded, setFolded] = useState<Set<string>>(new Set()), [max, setMax] = useState<string | null>(null);
  const narrow = useNarrow();
  const canvas = useRef<HTMLDivElement>(null), [cw, setCw] = useState(CELL); // 한 칸 폭(px) = 판 폭 ÷ 48
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setCw(Math.max(12, e.contentRect.width / COLS)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [narrow]);
  const byId = new Map(widgets.map((w) => [w.id, w]));

  /** 한 위젯을 바꾸고(칸 맞추기) 겹치면 밀어낸 뒤 저장 */
  const commit = (id: string, patch: Partial<Box>) => save(pushDown(layout.map((b) => (b.id === id ? snapBox({ ...b, ...patch }) : b)), id));
  const hide = (id: string) => save(layout.map((b) => (b.id === id ? { ...b, hidden: true } : b)));
  const fold = (id: string) => setFolded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const data = (b: Box): WData => ({ w: byId.get(b.id)!, cw, edit, folded: folded.has(b.id), onFold: () => fold(b.id), onMax: () => setMax(b.id), onHide: () => hide(b.id),
    onResized: (p) => commit(b.id, { x: p.x / cw, y: p.y / CELL, w: p.width / cw, h: p.height / CELL }) });
  const build = (): WNode[] => layout.filter((b) => !b.hidden && byId.has(b.id)).map((b) => ({
    id: b.id, type: "widget", position: { x: b.x * cw, y: b.y * CELL }, data: data(b), draggable: edit, selectable: edit, focusable: edit, ariaLabel: edit ? `${byId.get(b.id)!.title} 판(화살표 옮기기, Shift+화살표 크기, Delete 빼기)` : undefined,
    style: { width: b.w * cw, height: (folded.has(b.id) ? TITLE_H : b.h) * CELL },
  }));
  const [nodes, setNodes] = useState<WNode[]>([]);
  useEffect(() => setNodes(build()), [layout, edit, folded, widgets, cw]); // eslint 없음: build는 이것들로만 정해진다
  const onNodesChange = (ch: NodeChange<WNode>[]) => setNodes((n) => applyNodeChanges(ch, n));
  /** 편집 모드 키보드: 화살표 = 한 칸 옮기기, Shift+화살표 = 크기, Delete · Backspace = 빼기 */
  const onKey = (e: KeyboardEvent) => {
    const id = edit && e.target instanceof HTMLElement && e.target.classList.contains("react-flow__node") ? e.target.dataset.id : undefined;
    const b = id ? layout.find((x) => x.id === id) : undefined;
    if (!b) return;
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (d) { e.preventDefault(); commit(b.id, e.shiftKey ? { w: b.w + d[0], h: b.h + d[1] } : { x: b.x + d[0], y: b.y + d[1] }); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); hide(b.id); document.querySelector<HTMLElement>(".board-bar button")?.focus(); }
  };
  const shown = (id: string) => byId.get(id)!;

  return (
    <div className="board">
      <div className="board-bar">
        <button type="button" className="btn btn-sm" aria-pressed={edit} onClick={() => setEdit(!edit)}>{edit ? "배치 끝내기" : "배치 바꾸기"}</button>
        <button type="button" className="btn btn-sm" onClick={() => save(defaultLayout(ids))}>기본 배치로</button>
        {edit ? <span className="muted">판을 끌어 옮기고 모서리로 크기를 바꿔요. 키보드: 판에 Tab → 화살표 옮기기 · Shift+화살표 크기 · Delete 빼기. 배치는 이 브라우저에만 남아요.</span> : null}
        <Library widgets={widgets} layout={layout} onToggle={(id, on) => (on ? commit(id, { hidden: false }) : hide(id))} />
      </div>
      {narrow ? (
        <div className="board-stack">{stackOrder(layout).filter((id) => byId.has(id)).map((id) => (
          <Frame key={id} w={shown(id)} edit={false} folded={folded.has(id)} onFold={() => fold(id)} onMax={() => setMax(id)} onHide={() => hide(id)} />
        ))}</div>
      ) : (
        <div ref={canvas} className="board-canvas" style={{ height: boardHeight(layout), ["--cw" as string]: `${cw}px` }} onKeyDown={onKey} data-edit={edit ? "" : undefined}>
          <ReactFlow nodes={nodes} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeDragStop={(_, n) => commit(n.id, { x: n.position.x / cw, y: n.position.y / CELL })}
            snapToGrid snapGrid={[cw, CELL]} nodesDraggable={edit} nodesConnectable={false} elementsSelectable={edit} nodesFocusable={edit} edgesFocusable={false} disableKeyboardA11y
            defaultViewport={{ x: 0, y: 0, zoom: 1 }} minZoom={1} maxZoom={1} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false} panOnDrag={false} panOnScroll={false} preventScrolling={false}
            deleteKeyCode={null} proOptions={{ hideAttribution: true }} />
        </div>
      )}
      {max ? <MaxView w={shown(max)} onClose={() => setMax(null)} /> : null}
    </div>
  );
}

/** "+ 판": 보드에 걸 판을 고른다(켜면 그 자리, 끄면 뺌 — 배치는 그대로 기억) */
function Library({ widgets, layout, onToggle }: { widgets: Widget[]; layout: Box[]; onToggle: (id: string, on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const on = (id: string) => !layout.find((b) => b.id === id)?.hidden;
  const n = widgets.filter((w) => on(w.id)).length;
  return (
    <span className="board-lib">
      <button type="button" className="btn btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>+ 판 <span className="muted">{n}/{widgets.length}</span></button>
      {open ? <fieldset className="board-lib-pop" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
        <legend>보드에 걸 판</legend>
        {widgets.map((w) => <label key={w.id}><input type="checkbox" checked={on(w.id)} onChange={(e) => onToggle(w.id, e.target.checked)} /> {w.title}</label>)}
      </fieldset> : null}
    </span>
  );
}

/** 크게 보기: 화면을 덮는 창(Esc · 닫기), 열면 닫기 단추에 초점 */
function MaxView({ w, onClose }: { w: Widget; onClose: () => void }) {
  return (
    <div className="bw-max" role="dialog" aria-modal="true" aria-label={`${w.title} 크게 보기`} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="bw-max-box">
        <header className="bw-bar"><h2 className="bw-title">{w.title}</h2><button type="button" className="btn btn-sm" autoFocus onClick={onClose}>닫기 ✕</button></header>
        <div className="bw-body">{w.body}</div>
      </div>
    </div>
  );
}
