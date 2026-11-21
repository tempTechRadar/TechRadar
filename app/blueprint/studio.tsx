"use client";
// 청사진 스튜디오(P-12e): React Flow 캔버스 위 단계 노드 + 연결선(순서). 그래프는 lib/blueprint/graph.ts 순수 함수로만 바꾸고(apply 하나),
// 되돌리기 · 초안은 use-studio-graph. 단축키는 Esc(고른 것 풀기) · Delete(지우기) · 스페이스(손 모드)만, 나머지는 단추(사용자 결정).
// 빈 곳 끌기 = 여러 개 고르기(피그마식), 가운데 · 오른쪽 단추나 스페이스 + 끌기 = 화면 옮기기, 휠 = 커서 기준 확대.
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Background, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge as FlowEdge, type EdgeChange, type FinalConnectionState, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  addStage, autoLayout, connect, connectProblem, createStage, disconnect, LAYOUT, layers, limitProblems, LIMITS, putTech, removeStage, removeTech, toBoardView,
  type ConnectProblem, type Graph, type Pos,
} from "@/lib/blueprint/graph";
import { recommendAt } from "@/lib/blueprint/knowledge";
import type { BlueprintPage } from "@/lib/server/blueprints";
import { ToastLine, useToast } from "../undo-toast";
import { confirmGraphAction } from "./actions";
import { ConfirmDialog } from "./dialogs";
import { Dock } from "./dock";
import { GuideLines, useDragAssist } from "./drag-assist";
import { Inspector } from "./inspector";
import { ListMode } from "./list-mode";
import { StageNode, type StageNodeType } from "./stage-node";
import { Stepper, StepResult } from "./stepper";
import type { PanelProps, Picked, Step } from "./studio-types";
import { useStudioGraph } from "./use-studio-graph";
import "./studio.css";

const nodeTypes = { stage: StageNode };
const CONNECT_KO: Record<ConnectProblem, string> = {
  self: "자기 자신과는 이을 수 없어요.", missing: "없는 단계예요.", exists: "이미 이어져 있어요.",
  cycle: "이으면 순서가 돌고 돌아(고리) 이을 수 없어요.", limit: `연결은 ${LIMITS.edges}개까지예요.`,
};

type Props = BlueprintPage & { who: string; tags: Record<string, string[]> | null; add: string | null };
// 좁은 화면(휴대폰)은 캔버스 대신 목록 모드로 편집(사용자 결정: 캔버스는 보기만). 서버 그림은 넓은 화면으로 그린다
const NARROW = "(max-width: 860px)";
const onNarrow = (f: () => void) => { const m = matchMedia(NARROW); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };
const useNarrow = () => useSyncExternalStore(onNarrow, () => matchMedia(NARROW).matches, () => false);
export function Studio(props: Props) {
  return <ReactFlowProvider><StudioInner {...props} /></ReactFlowProvider>;
}

/** 확정 id는 내용(이름 · 프로젝트 · 판)마다 하나: 같은 내용을 다시 눌러도 한 줄(불변 3). 실패하면 판은 그대로(불변 4) */
function useConfirm(onDone: (id: string) => void) {
  const last = useRef({ key: "", id: "" });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const confirm = async (name: string, projectId: string | null, graph: Graph) => {
    // 같은 내용 = 단계(id · 이름 · 기술) + 연결선. 위치만 옮긴 것은 같은 확정으로 본다
    const key = JSON.stringify([name, projectId, graph.stages.map((s) => [s.id, s.name, s.techs.map((t) => t.id)]), graph.edges]);
    if (key !== last.current.key) last.current = { key, id: crypto.randomUUID() };
    setBusy(true); setError("");
    // 검사 · 관문(내 기술 · 적용 후보 · 내 이력) · 이름 다시 읽기는 DB 함수 confirm_blueprint_v2가 한다
    const r = await confirmGraphAction({ id: last.current.id, name, projectId, graph }).catch(() => ({ ok: false as const, message: "확정하지 못했어요. 판은 그대로 있어요. 잠시 뒤 다시 시도해 주세요." }));
    setBusy(false);
    if (r.ok) onDone(last.current.id); else setError(r.message);
  };
  return { confirm, busy, error, reset: () => setError("") };
}

function StudioInner({ who, pool, history, projects, tags: tags0, add }: Props) {
  const router = useRouter();
  const flow = useReactFlow();
  const { graph, push, undo, redo, canUndo, canRedo, name, setName, unread } = useStudioGraph(who);
  const [tags, setTags] = useState(tags0);
  // 넓은 화면: 캔버스(목록 모드 단추로 바꿈). 좁은 화면: 목록으로 고치기가 기본, "그림으로 보기"는 확대 · 이동만 되는 읽기 전용 캔버스
  const narrow = useNarrow(), [listOn, setListOn] = useState(false), [phoneView, setPhoneView] = useState(false);
  const listMode = narrow ? !phoneView : listOn, readOnly = narrow && phoneView;
  const [step, setStep] = useState<Step>(add ? 2 : 1);
  const [picked, setPicked] = useState<Picked>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()), [selEdges, setSelEdges] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<Map<string, Pos> | null>(null);
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(new Map()); // 잰 노드 크기(미니맵이 씀)
  const [newName, setNewName] = useState("");
  const [confirming, setConfirming] = useState(false);
  const { toast, say, clear } = useToast();
  const assist = useDragAssist();
  const info = useMemo(() => new Map(pool.map((t) => [t.id, t])), [pool]);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const done = useConfirm((id) => { setConfirming(false); setConfirmedId(id); say("확정해서 내 이력에 남겼어요. 아래 AI 점검 탭에서 점검을 받을 수 있어요."); router.refresh(); });
  const lay = useMemo(() => (graph ? layers(graph) : null), [graph]);
  const board = useMemo(() => (graph ? toBoardView(graph) : null), [graph]);

  if (!graph) return <p className="muted bp-wait">판을 준비하는 중…</p>;
  const g = graph;
  const apply = (next: Graph, message?: string) => { if (next === g) return; push(next); if (message) say(message); else clear(); };
  const stageOf = (id: string) => g.stages.find((s) => s.id === id);

  function dropTech(stageId: string, techId: string) {
    const t = info.get(techId), s = stageOf(stageId);
    if (!t || !s) return say("서랍에 있는 기술만 넣을 수 있어요(내 기술 · 적용 후보 · 이력).");
    if (t.grade === "danger") return say("위험 등급 기술은 청사진에 넣지 않아요.");
    if (s.techs.some((x) => x.id === techId)) return say(`${s.name}에 이미 있어요.`);
    if (s.techs.length >= LIMITS.techs) return say(`한 단계에 기술은 ${LIMITS.techs}개까지예요.`);
    apply(putTech(g, stageId, { id: t.id, name: t.name }), `${s.name}에 ${t.name} 붙였어요.`);
  }
  /** 새 단계: 고른 단계가 있으면 그 오른쪽에 두고 선으로 잇는다, 없으면 가장 오른쪽 단계 옆 */
  function addNamed(nm: string) {
    const base = picked ? stageOf(picked.stageId) : [...g.stages].sort((a, b) => b.x - a.x)[0];
    const s = createStage(nm, (base?.x ?? 0) + (base ? LAYOUT.x : 0), base?.y ?? 0);
    let next = addStage(g, s);
    if (next === g) return say(`단계 이름은 1~20자, 단계는 ${LIMITS.stages}개까지예요.`);
    if (picked && base) next = connect(next, base.id, s.id);
    apply(next, `"${s.name}" 단계를 더했어요.`);
    setNewName(""); setPicked({ kind: "stage", stageId: s.id }); setSel(new Set([s.id]));
  }
  const pickedOrder = picked && lay?.ok ? lay.depth.get(picked.stageId) ?? null : null;
  const hints = board ? recommendAt(board, pickedOrder === null ? board.length : pickedOrder + 1).slice(0, 4) : [];

  const nodes: StageNodeType[] = g.stages.map((s) => ({
    id: s.id, type: "stage", position: drag?.get(s.id) ?? { x: s.x, y: s.y }, selected: sel.has(s.id), measured: dims.get(s.id),
    data: { stage: s, order: lay?.ok ? lay.depth.get(s.id) ?? null : null, step, picked, info, readOnly, onPick: setPicked, onDropTech: dropTech, onRemoveTech: (sid, tid) => apply(removeTech(g, sid, tid)) },
  }));
  const edges: FlowEdge[] = g.edges.map((e) => {
    const id = `${e.from}>${e.to}`, on = selEdges.has(id) || sel.has(e.from) || sel.has(e.to);
    return { id, source: e.from, target: e.to, selected: selEdges.has(id), className: on ? "se se-on" : "se", markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 } };
  });
  const near = assist.near;
  if (near) edges.push({ id: "near", source: near.from, target: near.to, selectable: false, focusable: false, deletable: false, className: near.blocked ? "se se-blocked" : "se se-near",
    label: near.blocked === "cycle" ? "고리가 생겨 못 이어요" : near.blocked ? "못 이어요" : "놓으면 이어져요",
    labelStyle: { fontSize: 11, fill: near.blocked ? "var(--ink-danger)" : "var(--ink-2)" } });

  function onNodesChange(changes: NodeChange<StageNodeType>[]) {
    let nextSel: Set<string> | null = null, nextDims: typeof dims | null = null, moved = drag, ended = false;
    const raw = new Map<string, Pos>();
    for (const c of changes) {
      if (c.type === "select") { nextSel ??= new Set(sel); if (c.selected) nextSel.add(c.id); else nextSel.delete(c.id); }
      if (c.type === "dimensions" && c.dimensions) (nextDims ??= new Map(dims)).set(c.id, c.dimensions);
      if (c.type === "position") {
        if (c.position) raw.set(c.id, c.position);
        if (c.dragging === false) ended = true;
      }
    }
    if (nextDims) setDims(nextDims);
    if (raw.size) moved = new Map([...(moved ?? []), ...assist.during(g, raw)]); // 격자 · 보조선에 붙인 위치
    if (nextSel) {
      setSel(nextSel);
      const one = nextSel.size === 1 ? [...nextSel][0] : null;
      setPicked((p) => (one ? (p?.stageId === one ? p : { kind: "stage", stageId: one }) : null));
    }
    if (ended) { const r = assist.drop(g, moved); apply(r.next, r.linked ? "가까이 둔 단계와 이었어요." : undefined); setDrag(null); } else if (moved !== drag) setDrag(moved);
  }
  function onEdgesChange(changes: EdgeChange[]) {
    let next: Set<string> | null = null;
    for (const c of changes) if (c.type === "select") { next ??= new Set(selEdges); if (c.selected) next.add(c.id); else next.delete(c.id); }
    if (next) setSelEdges(next);
  }
  const onConnect = (c: Connection) => { const p = connectProblem(g, c.source, c.target); if (p) say(CONNECT_KO[p]); else apply(connect(g, c.source, c.target)); };
  /** 못 잇는 곳에 놓았을 때(isValidConnection이 막아 onConnect가 안 불림) 이유를 알린다. 들어오는 점에서 끌었으면 방향을 뒤집어 본다 */
  const onConnectEnd = (_: unknown, st: FinalConnectionState) => {
    if (st.isValid !== false || !st.fromNode || !st.toNode) return;
    const [from, to] = st.fromHandle?.type === "target" ? [st.toNode.id, st.fromNode.id] : [st.fromNode.id, st.toNode.id];
    const p = connectProblem(g, from, to);
    if (p) say(CONNECT_KO[p]);
  };
  function onDelete({ nodes: ns, edges: es }: { nodes: { id: string }[]; edges: FlowEdge[] }) {
    let next = g;
    for (const e of es) next = disconnect(next, e.source, e.target);
    for (const n of ns) next = removeStage(next, n.id);
    apply(next, ns.length ? `단계 ${ns.length}개를 지웠어요. 되돌리기로 살릴 수 있어요.` : "선을 지웠어요.");
    setSel(new Set()); setSelEdges(new Set()); setPicked(null);
  }
  const unpick = () => { setSel(new Set()); setSelEdges(new Set()); setPicked(null); };
  const problems = limitProblems(g);
  /** 패널에서 고르면 캔버스에서도 그 단계를 고른 모양으로 */
  const pick = (p: Picked) => { setPicked(p); setSel(p ? new Set([p.stageId]) : new Set()); };
  const panel: PanelProps = { graph: g, step, picked, onPick: pick, apply, pool, tags, onTags: (id, t) => setTags((x) => (x ? { ...x, [id]: t } : x)), history, say, confirmedId };

  return (
    <div className="studio" data-step={step} onKeyDown={(e) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) unpick(); }}>
      <div className="studio-bar">
        <label className="sr-only" htmlFor="bp-name">청사진 이름</label>
        <input id="bp-name" className="bp-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Stepper step={step} onStep={setStep} />
        <span className="studio-grow" />
        <button type="button" className="btn" disabled={!canUndo} onClick={undo}>되돌리기</button>
        <button type="button" className="btn" disabled={!canRedo} onClick={redo}>다시</button>
        <button type="button" className="btn" onClick={() => { const next = autoLayout(g); apply(next, next === g ? "고리가 있으면 자동 정렬을 할 수 없어요." : "순서대로 정렬했어요."); requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 200 })); }}>자동 정렬</button>
        <button type="button" className="btn" disabled={listMode} onClick={() => void flow.fitView({ padding: 0.2, duration: 200 })}>보기 초기화</button>
        {narrow ? <button type="button" className="btn" aria-pressed={phoneView} onClick={() => setPhoneView(!phoneView)}>그림으로 보기</button>
          : <button type="button" className="btn" aria-pressed={listOn} onClick={() => setListOn(!listOn)}>목록 모드(키보드 · 화면 읽기)</button>}
      </div>
      {unread ? <p className="notice studio-note" role="status">지난 초안을 읽지 못해 새 판으로 열었어요. 지난 초안은 지우지 않고 이 브라우저에 따로 보관했어요.</p> : null}
      {step === 1 ? (
        <form className="studio-add" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) addNamed(newName.trim()); }}>
          <label>새 단계 <input value={newName} maxLength={20} placeholder="예: 리서치" onChange={(e) => setNewName(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>{picked ? "고른 단계 다음에 더하기" : "단계 더하기"}</button>
          {hints.map((h) => <button key={h} type="button" className="chip" onClick={() => addNamed(h)}>+ {h}</button>)}
        </form>
      ) : null}
      <div className="studio-main" data-list={listMode ? "" : undefined}>
        {listMode ? <div className="studio-list"><ListMode {...panel} /></div> : (
          <div className="studio-canvas" role="region" aria-label="청사진 캔버스. 단계를 끌어 옮기고, 오른쪽 점에서 다른 단계의 왼쪽 점으로 끌어 순서를 이어요. 키보드 · 화면 읽기는 목록 모드를 쓰세요">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect} onConnectEnd={onConnectEnd} isValidConnection={(c) => connectProblem(g, c.source, c.target) === null} onDelete={onDelete} onPaneClick={unpick}
              deleteKeyCode={readOnly ? null : "Delete"} selectionOnDrag={!readOnly} panOnDrag={readOnly ? true : [1, 2]} panActivationKeyCode="Space"
              nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable={!readOnly}
              minZoom={0.3} maxZoom={2} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}>
              <Background gap={16} size={1} />
              <GuideLines guides={assist.guides} />
              {narrow ? null : <MiniMap pannable zoomable ariaLabel="미니맵" className="studio-mini" bgColor="#ffffff" nodeColor="#8c8c8c" maskColor="rgba(0, 0, 0, 0.06)" />}
            </ReactFlow>
          </div>
        )}
        {narrow ? null : <aside className="studio-insp" aria-label="속성 패널"><Inspector {...panel} /></aside>}
      </div>
      {step === 3 ? <StepResult name={name.trim() || "이름 없는 청사진"} board={board} problems={problems} say={say} onConfirm={() => { done.reset(); setConfirming(true); }} /> : null}
      <Dock {...panel} />
      <ToastLine toast={toast} clear={clear} className="bp-toast" />
      {confirming && board ? <ConfirmDialog name={name.trim() || "이름 없는 청사진"} board={board} projects={projects} busy={done.busy} error={done.error}
        onConfirm={(p) => void done.confirm(name.trim() || "이름 없는 청사진", p, g)} onClose={() => setConfirming(false)} /> : null}
    </div>
  );
}
