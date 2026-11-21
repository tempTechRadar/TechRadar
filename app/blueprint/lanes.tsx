"use client";
// 블루프린트 판 그리기: 시작 → 열(같은 열 = 동시에) → 끝, 열 사이 + 틈, 열 아래 + 나란히, 선(앞 열의 모든 단계 → 다음 열의 모든 단계).
// 옮기기는 끌어 놓기(마우스) 또는 단계 안 단추(키보드 · 화면 읽기: ← → ↑ ↓ · 떼기 · 앞/뒤와 나란히). 바꾸기는 모두 순수 함수(lib/blueprint/board.ts)로.
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from "react";
import { addColumn, addParallel, canJoin, canSplitOut, join, lift, moveStage, removeStage, removeTech, renameStage, shift, split, MAX_COLUMNS, MAX_PARALLEL, STAGE_NAME_MAX, type Board, type Stage } from "@/lib/blueprint/board";
import { recommendAt, recommendBeside } from "@/lib/blueprint/knowledge";
import { isUuid } from "@/lib/domain/my-tech-view";

export type Change = (next: Board, message?: string, undoable?: boolean) => void;
export type DragTech = { id: string; name: string; grade: string };
type Pop = { kind: "gap" | "par"; at: number } | null;
type Props = { board: Board; focus: string | null; onFocus: (id: string | null) => void; change: Change; dropTech: (stageId: string, t: DragTech) => void };
const ZONE = "[data-stage], [data-gap], [data-col]";

/** 끌어 온 글에서 기술을 꺼낸다. 다른 곳에서 끌어 온 글 · 모양이 틀린 값은 버린다(null) */
function readDragTech(raw: string): DragTech | null {
  try {
    const t = JSON.parse(raw) as Partial<DragTech>;
    return isUuid(t.id) && typeof t.name === "string" && typeof t.grade === "string" ? { id: t.id, name: t.name, grade: t.grade } : null;
  } catch { return null; }
}

/** 놓은 자리: 기술 → 그 단계에 붙이기, 단계 → 틈이면 새 열 · 열이면 나란히 */
function onDropAt(e: DragEvent, { board, change, dropTech }: Pick<Props, "board" | "change" | "dropTech">) {
  const zone = (e.target as Element).closest?.(ZONE) as HTMLElement | null;
  if (!zone) return;
  e.preventDefault();
  const raw = e.dataTransfer.getData("text/plain");
  if (raw.startsWith("tech:")) {
    const t = readDragTech(raw.slice(5));
    if (t && zone.dataset.stage) dropTech(zone.dataset.stage, t);
    return;
  }
  if (!raw.startsWith("stage:")) return;
  const id = raw.slice(6), gap = zone.dataset.gap;
  const next = gap !== undefined ? moveStage(board, id, { col: Number(gap), newColumn: true })
    : moveStage(board, id, { col: Number((zone.closest("[data-col]") as HTMLElement).dataset.col), newColumn: false });
  if (next !== board) change(next, gap !== undefined ? "새 단계 자리로 옮겼어요." : "나란히 붙였어요(같은 열 = 동시에).", true);
}

export function Lanes({ board, focus, onFocus, change, dropTech }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [pop, setPop] = useState<Pop>(null);
  const wires = useWires(box, board);
  useEffect(() => {
    if (!pop) return;
    const outside = (e: MouseEvent) => { if (!(e.target as Element).closest?.(".bp-pop, [data-pop]")) setPop(null); };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [pop]);
  const add = (name: string) => {
    if (!pop) return;
    change(pop.kind === "gap" ? addColumn(board, pop.at, name) : addParallel(board, pop.at, name), pop.kind === "gap" ? `"${name}" 단계를 넣었어요.` : `"${name}"을(를) 나란히 넣었어요.`);
    setPop(null);
  };
  const toggle = (kind: "gap" | "par", at: number) => setPop(pop?.kind === kind && pop.at === at ? null : { kind, at });
  const gap = (i: number) => <Gap key={`g${i}`} i={i} board={board} open={pop?.kind === "gap" && pop.at === i} onToggle={() => toggle("gap", i)} onAdd={add} onClose={() => setPop(null)} />;
  return (
    <div ref={box} className="bp-lanes" onDragOver={(e) => { if ((e.target as Element).closest?.(ZONE)) e.preventDefault(); }} onDrop={(e) => onDropAt(e, { board, change, dropTech })}>
      <svg className="bp-wires" aria-hidden="true" width={wires.w} height={wires.h}><path d={wires.d} /></svg>
      <div className="bp-end" data-node="start">시작</div>
      {gap(0)}
      {board.map((col, c) => (
        <div key={col[0].id} className="bp-colwrap">
          <section className="bp-col" data-col={c} aria-label={`${c + 1}번째 단계${col.length > 1 ? `, ${col.length}개를 동시에` : ""}`}>
            {col.map((s, r) => <StageCard key={s.id} s={s} c={c} r={r} board={board} focused={focus === s.id} onFocus={onFocus} change={change} />)}
            <button type="button" className="btn bp-par" data-pop disabled={col.length >= MAX_PARALLEL} aria-expanded={pop?.kind === "par" && pop.at === c} onClick={() => toggle("par", c)}>+ 나란히</button>
            {pop?.kind === "par" && pop.at === c ? <AddPop title="나란히 할 단계" recs={recommendBeside(board, c)} onAdd={add} onClose={() => setPop(null)} /> : null}
          </section>
          {gap(c + 1)}
        </div>
      ))}
      <div className="bp-end" data-node="end">끝</div>
    </div>
  );
}

function Gap({ i, board, open, onToggle, onAdd, onClose }: { i: number; board: Board; open: boolean; onToggle: () => void; onAdd: (n: string) => void; onClose: () => void }) {
  const label = i === 0 ? "맨 앞에 단계 넣기" : i === board.length ? "맨 뒤에 단계 넣기" : `${i}번째와 ${i + 1}번째 사이에 단계 넣기`;
  return (
    <div className="bp-gap" data-gap={i}>
      <button type="button" className="bp-plus" data-pop onClick={onToggle} disabled={board.length >= MAX_COLUMNS} aria-label={label} aria-expanded={open}>+</button>
      {open ? <AddPop title="여기에 넣을 단계" recs={recommendAt(board, i)} onAdd={onAdd} onClose={onClose} /> : null}
    </div>
  );
}

function AddPop({ title, recs, onAdd, onClose }: { title: string; recs: string[]; onAdd: (n: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="bp-pop" role="group" aria-label={title} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}>
      <b>{title}</b>
      <div className="bp-row">{recs.length ? recs.map((n, i) => <button key={n} type="button" className="btn bp-sm" autoFocus={i === 0} onClick={() => onAdd(n)}>{n}</button>) : <span className="muted">추천이 없어요</span>}</div>
      <form className="bp-row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onAdd(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={STAGE_NAME_MAX} placeholder="직접 이름 쓰기" aria-label="단계 이름" autoFocus={!recs.length} />
        <button type="submit" className="btn bp-sm">넣기</button>
      </form>
      <span className="muted">추천은 앞뒤 단계를 보고 골라요</span>
    </div>
  );
}

type CardProps = { s: Stage; c: number; r: number; board: Board; focused: boolean; onFocus: (id: string | null) => void; change: Change };
function StageCard({ s, c, r, board, focused, onFocus, change }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(s.name);
  const solo = board[c].length === 1;
  return (
    <article className={`bp-stage${focused ? " focused" : ""}`} data-stage={s.id} draggable={!editing} onDragStart={(e) => e.dataTransfer.setData("text/plain", `stage:${s.id}`)}
      aria-label={`${c + 1}번째 단계 ${s.name}${solo ? "" : `, ${board[c].length}개와 나란히`}`}>
      <header>
        <button type="button" className="btn bp-sm bp-num" aria-pressed={focused} onClick={() => onFocus(focused ? null : s.id)} title="이 단계에 맞는 기술만 서랍에">{c + 1}</button>
        {editing ? (
          <form className="bp-rename" onSubmit={(e) => { e.preventDefault(); change(renameStage(board, s.id, text)); setEditing(false); }}>
            <input value={text} onChange={(e) => setText(e.target.value)} maxLength={STAGE_NAME_MAX} aria-label="단계 이름" autoFocus onKeyDown={(e) => { if (e.key === "Escape") { setText(s.name); setEditing(false); } }} />
            <button type="submit" className="btn bp-sm">저장</button>
          </form>
        ) : <b>{s.name}</b>}
        {editing ? null : <button type="button" className="btn bp-sm" onClick={() => { setText(s.name); setEditing(true); }} aria-label={`${s.name} 이름 바꾸기`}>✎</button>}
        <button type="button" className="btn bp-sm" onClick={() => { if (focused) onFocus(null); change(removeStage(board, s.id), `"${s.name}" 단계를 뺐어요.`, true); }} aria-label={`${s.name} 빼기`}>✕</button>
      </header>
      <div className="bp-slots">
        {s.techs.length ? s.techs.map((t) => (
          <span key={t.id} className="bp-chip">{t.name}<button type="button" onClick={() => change(removeTech(board, s.id, t.id))} aria-label={`${s.name}에서 ${t.name} 빼기`}>✕</button></span>
        )) : <span className="muted">번호를 누르고 서랍에서 넣거나, 기술을 끌어 와요</span>}
      </div>
      <Moves s={s} c={c} r={r} board={board} change={change} />
    </article>
  );
}

/** 끌지 않고 옮기기(WCAG 2.5.7): 못 하는 움직임은 흐리게(눌러도 아무 일 없는 단추를 두지 않음) */
function Moves({ s, c, r, board, change }: Omit<CardProps, "focused" | "onFocus">) {
  const solo = board[c].length === 1, out = canSplitOut(board, c);
  const moved = (next: Board) => { change(next); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-stage="${s.id}"] .bp-num`)?.focus()); };
  return (
    <div className="bp-moves" role="group" aria-label="끌지 않고 옮기기">
      <button type="button" className="btn bp-sm" onClick={() => moved(shift(board, s.id, -1))} disabled={(c === 0 && solo) || !out} aria-label="앞 단계로">←</button>
      <button type="button" className="btn bp-sm" onClick={() => moved(shift(board, s.id, 1))} disabled={(c === board.length - 1 && solo) || !out} aria-label="뒤 단계로">→</button>
      <button type="button" className="btn bp-sm" onClick={() => moved(lift(board, s.id, -1))} disabled={r === 0} aria-label="위로">↑</button>
      <button type="button" className="btn bp-sm" onClick={() => moved(lift(board, s.id, 1))} disabled={r === board[c].length - 1} aria-label="아래로">↓</button>
      {solo ? null : <button type="button" className="btn bp-sm" onClick={() => moved(split(board, s.id))} disabled={!out} title="나란히에서 떼어 바로 뒤 단계로">떼기</button>}
      <button type="button" className="btn bp-sm" onClick={() => moved(join(board, s.id, -1))} disabled={!canJoin(board, c, -1)} aria-label="앞 단계와 나란히(동시에)">⇤나란히</button>
      <button type="button" className="btn bp-sm" onClick={() => moved(join(board, s.id, 1))} disabled={!canJoin(board, c, 1)} aria-label="뒤 단계와 나란히(동시에)">나란히⇥</button>
    </div>
  );
}

type Pt = { l: number; r: number; y: number };
/** 선 그리기용 경로: 이웃한 두 무리(시작 · 열마다의 단계 · 끝)의 모든 짝을 곡선으로 */
const wirePath = (cols: Pt[][]) => cols.slice(1).flatMap((next, i) => cols[i].flatMap((p) => next.map((t) => {
  const m = (p.r + t.l) / 2;
  return `M${p.r} ${p.y} C${m} ${p.y} ${m} ${t.y} ${t.l} ${t.y}`;
}))).join(" ");

/** 선: 판이 바뀌거나 크기가 바뀌면 다시 잰다 */
function useWires(box: React.RefObject<HTMLDivElement | null>, board: Board) {
  const [w, setW] = useState({ d: "", w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const at = (n: Element): Pt => { const r = n.getBoundingClientRect(); return { l: r.left - base.left, r: r.right - base.left, y: r.top - base.top + r.height / 2 }; };
      const group = (sel: string[]) => sel.map((q) => el.querySelector(q)).filter((x): x is Element => !!x).map(at);
      const cols = [group(['[data-node="start"]']), ...board.map((col) => group(col.map((s) => `[data-stage="${s.id}"]`))), group(['[data-node="end"]'])];
      setW({ d: wirePath(cols), w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [box, board]);
  return w;
}
