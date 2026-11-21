"use client";
// 청사진 스튜디오(P-12e): React Flow 캔버스 위 단계 노드 + 연결선(순서). 그래프는 lib/blueprint/graph.ts 순수 함수로만 바꾸고(apply 하나),
// 되돌리기 · 초안은 use-studio-graph. 단축키는 Esc(고른 것 풀기) · Delete(지우기) · 스페이스(손 모드)만, 나머지는 단추(사용자 결정).
// 빈 곳 끌기 = 여러 개 고르기(피그마식), 가운데 · 오른쪽 단추나 스페이스 + 끌기 = 화면 옮기기, 휠 = 커서 기준 확대.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Background, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge as FlowEdge, type EdgeChange, type FinalConnectionState, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  addStage, applyTemplate, autoLayout, connect, fromV1, connectProblem, createStage, disconnect, LAYOUT, layers, limitProblems, LIMITS, putTech, removeStage, removeTech, toBoardView,
  type Graph, type Pos, type TemplateKind,
} from "@/lib/blueprint/graph";
import { fromNames } from "@/lib/blueprint/board";
import { recommendAt } from "@/lib/blueprint/knowledge";
import { addStageProblem, CONNECT_KO, newStageSpot, putProblem } from "@/lib/blueprint/panel-view";
import type { BlueprintPage, PoolTech } from "@/lib/server/blueprints";
import { ToastLine, useToast } from "../undo-toast";
import { markTech } from "../tech-map/actions";
import { AskDialog } from "../c-dialog";
import { ConfirmDialog, InterviewDialog } from "./dialogs";
import { Dock } from "./dock";
import { GuideLines, useDragAssist } from "./drag-assist";
import { Inspector } from "./inspector";
import { ListMode } from "./list-mode";
import { StageNode, type StageNodeType } from "./stage-node";
import { Stepper, StepResult } from "./stepper";
import type { PanelProps, Picked, Step } from "./studio-types";
import { useStudioGraph } from "./use-studio-graph";
import { useConfirm } from "./use-studio-save";
import "./studio.css";

const nodeTypes = { stage: StageNode };

/** template = 갤러리의 "이 템플릿으로 시작"(서버가 읽음), templateMissing = 주소에 있었지만 열지 못함. guest = 로그인 전(P-12f): 판은 이 브라우저에만, 저장 · 판단은 로그인 안내 */
type Props = BlueprintPage & { who: string; tags: Record<string, string[]> | null; add: string | null; template: UsableTemplate | null; templateMissing: boolean; guest?: boolean };
type UsableTemplate = { id: string; kind: TemplateKind; name: string; graph: Graph };
// 좁은 화면(휴대폰)은 캔버스 대신 목록 모드로 편집(사용자 결정: 캔버스는 보기만). 서버 그림은 넓은 화면으로 그린다
const NARROW = "(max-width: 860px)";
const onNarrow = (f: () => void) => { const m = matchMedia(NARROW); m.addEventListener("change", f); return () => m.removeEventListener("change", f); };
const useNarrow = () => useSyncExternalStore(onNarrow, () => matchMedia(NARROW).matches, () => false);
export function Studio(props: Props) {
  return <ReactFlowProvider><StudioInner {...props} /></ReactFlowProvider>;
}

function StudioInner({ who, pool, history, projects, tags: tags0, add, template, templateMissing, guest = false }: Props) {
  const router = useRouter();
  const flow = useReactFlow();
  const { graph, push, undo, redo, canUndo, canRedo, name, setName, unread, guestDraft, answerGuest } = useStudioGraph(who);
  const [tags, setTags] = useState(tags0);
  // 넓은 화면: 캔버스(목록 모드 단추로 바꿈). 좁은 화면: 목록으로 고치기가 기본, "그림으로 보기"는 확대 · 이동만 되는 읽기 전용 캔버스
  const narrow = useNarrow(), [listOn, setListOn] = useState(false), [phoneView, setPhoneView] = useState(false);
  const listMode = narrow ? !phoneView : listOn, readOnly = narrow && phoneView;
  const [step, setStep] = useState<Step>(add ? 2 : 1);
  const [picked, setPicked] = useState<Picked>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()), [selEdges, setSelEdges] = useState<Set<string>>(new Set());
  // shortcut: 끄는 동안의 위치를 이 컴포넌트 상태에 둬서 포인터가 움직일 때마다 패널까지 다시 그린다. 단계가 수십 개를 넘어 끌기가 버벅이면 캔버스 자식으로 내리거나 패널을 memo한다
  const [drag, setDrag] = useState<Map<string, Pos> | null>(null);
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(new Map()); // 잰 노드 크기(미니맵이 씀)
  const [newName, setNewName] = useState("");
  const [loginAsk, setLoginAsk] = useState<string | null>(null); // 손님이 저장 · 판단을 누름: 무엇을 하려는지(묻는 대화상자 글)
  const [confirming, setConfirming] = useState(false), [asking, setAsking] = useState(false), [marking, setMarking] = useState<string | null>(null);
  const { toast, say, clear } = useToast();
  const assist = useDragAssist();
  const [found, setFound] = useState<PoolTech[]>([]); // 손님이 카탈로그에서 찾은 기술: 끌어 놓을 수 있게 info에만 더한다(손님 서랍)
  const info = useMemo(() => new Map([...found, ...pool].map((t) => [t.id, t])), [pool, found]);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  // 실패 문구는 확정 창이 열려 있으면 창 안에만, 창을 닫은 뒤 왔으면 알림으로(같은 말을 두 번 보이지 않게)
  const confirmOpen = useRef(false);
  confirmOpen.current = confirming;
  const done = useConfirm((id) => { setConfirming(false); setConfirmedId(id); say("확정해서 내 이력에 남겼어요. 아래 AI 점검 탭에서 점검을 받을 수 있어요."); router.refresh(); },
    (m) => { if (!confirmOpen.current) say(m); });
  const lay = useMemo(() => (graph ? layers(graph) : null), [graph]);
  const board = useMemo(() => (graph ? toBoardView(graph) : null), [graph]);
  // "이 템플릿으로 시작": 초안을 읽은 뒤 한 번 펼친다(되돌리기 한 칸 = 전에 만들던 판). 새로 고쳐도 다시 펼치지 않게 주소에서 뺀다
  const [templateId, setTemplateId] = useState<string | null>(null);
  const inflight = useRef(new Set<string>()); // 지금 서버에 보내는 "적용 후보로 고르기"
  const started = useRef(false);
  useEffect(() => {
    if (!graph || started.current) return;
    started.current = true;
    if (template) {
      push(applyTemplate(template.graph, template.kind), template.name); setTemplateId(template.id);
      say(`"${template.name}" ${template.kind === "frame" ? "틀" : "조합"}로 시작했어요. 되돌리기를 누르면 전에 만들던 판으로 돌아가요.`);
    } else if (templateMissing) say("템플릿을 열지 못했어요. 지워졌거나 비공개로 바뀌었을 수 있어요.");
    if (template || templateMissing) { const q = new URLSearchParams(location.search); q.delete("template"); window.history.replaceState(null, "", q.size ? `?${q}` : location.pathname); }
  }, [graph, template, templateMissing, push, say]);

  if (!graph) return <p className="muted bp-wait">판을 준비하는 중…</p>;
  const g = graph;
  /** name을 주면 다른 곳에서 판을 통째로 가져온 일(이력 불러오기 등): 이름도 함께 되돌리기 칸에 넣고, 시작한 템플릿 표시는 지운다 */
  const apply = (next: Graph, message?: string, nm?: string) => {
    if (next === g && (nm === undefined || nm === name)) return;
    push(next, nm);
    if (nm !== undefined) setTemplateId(null);
    if (message) say(message); else clear();
  };
  const stageOf = (id: string) => g.stages.find((s) => s.id === id);

  /** 손님이 저장 · 판단을 누르면: 판은 이 브라우저(손님 초안)에 그대로 두고 로그인으로. 로그인한 뒤 청사진에서 가져올지 묻는다 */
  const toLogin = (what: string) => setLoginAsk(what);
  /** 후보 칩의 "적용 후보로 고르기": 지도와 같은 판단 저장(markTech). 성공하면 서랍(관문 목록)을 다시 읽어 보통 칩이 된다 */
  async function markCandidate(techId: string, techName: string) {
    if (guest) return toLogin("적용 후보로 고르려면");
    if (inflight.current.has(techId)) return; // 같은 기술을 겹쳐 보내지 않게(다른 기술을 고르는 사이 단추가 다시 켜져도)
    inflight.current.add(techId); setMarking(techId);
    const r = await markTech(techId, "candidate", "").catch(() => ({ ok: false as const, message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." }));
    inflight.current.delete(techId); setMarking((m) => (m === techId ? null : m));
    if (r.ok) { say(`${techName}을(를) 적용 후보로 골랐어요.`); router.refresh(); } else say(r.message);
  }
  function dropTech(stageId: string, techId: string) {
    const t = info.get(techId), s = stageOf(stageId);
    if (!t || !s) return say("서랍에 있는 기술만 넣을 수 있어요(내 기술 · 적용 후보 · 이력).");
    const why = putProblem(s, t);
    if (why) return say(why);
    apply(putTech(g, stageId, { id: t.id, name: t.name }), `${s.name}에 ${t.name} 붙였어요.`);
  }
  const base = picked ? stageOf(picked.stageId) : undefined; // 되돌리기 뒤 사라진 단계를 가리키면 없는 것으로
  /** 새 단계: 고른 단계가 있으면 그 오른쪽 빈자리(아래로 내려가며 찾음)에 두고 선으로 잇는다, 없으면 맨 오른쪽 단계 옆 */
  function addNamed(nm: string) {
    const why = addStageProblem(g, nm);
    if (why) return say(why);
    let at = base ? { x: base.x + LAYOUT.x, y: base.y } : newStageSpot(g);
    const taken = (p: Pos) => g.stages.some((o) => Math.abs(o.x - p.x) < LAYOUT.x / 2 && Math.abs(o.y - p.y) < LAYOUT.y / 2);
    for (let i = 0; base && taken(at) && i < LIMITS.stages; i++) at = { x: at.x, y: at.y + LAYOUT.y };
    const s = createStage(nm, at.x, at.y);
    let next = addStage(g, s);
    if (base) next = connect(next, base.id, s.id);
    apply(next, `"${s.name}" 단계를 더했어요.`);
    setNewName(""); setPicked({ kind: "stage", stageId: s.id }); setSel(new Set([s.id]));
  }
  const pickedOrder = picked && lay?.ok ? lay.depth.get(picked.stageId) ?? null : null;
  const hints = board ? recommendAt(board, pickedOrder === null ? board.length : pickedOrder + 1).slice(0, 4) : [];

  const nodes: StageNodeType[] = g.stages.map((s) => ({
    id: s.id, type: "stage", position: drag?.get(s.id) ?? { x: s.x, y: s.y }, selected: sel.has(s.id), measured: dims.get(s.id),
    data: { stage: s, order: lay?.ok ? lay.depth.get(s.id) ?? null : null, step, picked, info, readOnly, onPick: setPicked, onDropTech: dropTech, onRemoveTech: (sid, tid) => apply(removeTech(g, sid, tid)),
      onCandidate: (tid, tn) => void markCandidate(tid, tn), marking },
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
    let nextSel: Set<string> | null = null, nextDims: typeof dims | null = null, moved = drag, ended = false, dragging = false;
    const raw = new Map<string, Pos>();
    for (const c of changes) {
      if (c.type === "select") { nextSel ??= new Set(sel); if (c.selected) nextSel.add(c.id); else nextSel.delete(c.id); }
      if (c.type === "dimensions" && c.dimensions) (nextDims ??= new Map(dims)).set(c.id, c.dimensions);
      if (c.type === "position") {
        if (c.position) raw.set(c.id, c.position);
        if (c.dragging) dragging = true;
        if (c.dragging === false) ended = true;
      }
    }
    if (nextDims) setDims(nextDims);
    // 마우스로 끌 때만 격자 · 보조선에 붙인다(화살표 키 5px 이동이 보조선에 다시 붙어 제자리로 돌아오지 않게)
    const placed = dragging ? assist.during(g, raw) : new Map([...raw].map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]));
    if (raw.size) moved = new Map([...(moved ?? []), ...placed]);
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
  /** 질문 6개의 답으로 만든 틀(11-21 사용자 결정 "① 단계 구축에 다시 잇기"). 지금 판이 있으면 대화상자 마지막에 "바꾸기"로 묻고, 되돌리기 한 칸이면 전 판 */
  function makeFromAnswers(cols: string[][]) {
    setAsking(false); unpick(); setTemplateId(null);
    apply(fromV1(fromNames(cols)), "질문 답으로 틀을 만들었어요. 되돌리기를 누르면 전 판으로 돌아가요.");
  }
  const unpick = () => { setSel(new Set()); setSelEdges(new Set()); setPicked(null); };
  /** 지우기 키: 캔버스 안에 초점이 있을 때만(React Flow의 deleteKeyCode는 문서 전체에서 들어 패널 · 확정 창에서도 지워짐). Mac의 delete = Backspace */
  function onCanvasKey(e: React.KeyboardEvent) {
    if (readOnly || (e.key !== "Delete" && e.key !== "Backspace") || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!sel.size && !selEdges.size) return;
    e.preventDefault();
    onDelete({ nodes: [...sel].map((id) => ({ id })), edges: edges.filter((x) => selEdges.has(x.id)) });
  }
  // 관문 밖 기술(서랍 = 내 기술 · 적용 후보 · 이력에 없음, 남의 조합 템플릿에서 온 것)이 남아 있으면 확정을 막는다(DB도 거절)
  const outside = new Set(g.stages.flatMap((s) => s.techs.filter((t) => !info.has(t.id)).map((t) => t.id)));
  // 손님은 관문이 없어 모든 기술이 밖이다: 막지 않고 확정을 누르면 로그인 안내
  const problems = [...(g.stages.length ? [] : ["단계를 하나 이상 만들어 주세요."]), ...limitProblems(g), ...(outside.size && !guest ? [`판단 안 한 기술 ${outside.size}개 — 적용 후보로 고르거나 빼 주세요.`] : [])];
  /** 패널에서 고르면 캔버스에서도 그 단계를 고른 모양으로 */
  const pick = (p: Picked) => { setPicked(p); setSel(p ? new Set([p.stageId]) : new Set()); };
  const panel: PanelProps = { graph: g, step, picked, onPick: pick, apply, pool, tags, onTags: (id, t) => setTags((x) => (x ? { ...x, [id]: t } : x)), history, say, confirmedId,
    onCandidate: (tid, tn) => void markCandidate(tid, tn), marking,
    guest, onFound: guest ? (ts) => setFound((x) => [...x, ...ts.filter((t) => !x.some((y) => y.id === t.id))]) : undefined };

  return (
    <div className="studio" data-step={step} onKeyDown={(e) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) unpick(); }}>
      <div className="studio-bar">
        <label className="sr-only" htmlFor="bp-name">청사진 이름</label>
        <input id="bp-name" className="bp-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <Stepper step={step} onStep={setStep} />
        <span className="studio-grow" />
        <button type="button" className="btn" disabled={!canUndo} onClick={undo}>되돌리기</button>
        <button type="button" className="btn" disabled={!canRedo} onClick={redo}>다시</button>
        <button type="button" className="btn" onClick={() => { const next = autoLayout(g); if (next === g) return say("바꿀 자리가 없어요. 이미 정렬됐거나 선이 고리로 이어져 있어요."); apply(next, "순서대로 정렬했어요."); requestAnimationFrame(() => void flow.fitView({ padding: 0.2, duration: 200 })); }}>자동 정렬</button>
        <button type="button" className="btn" disabled={listMode} onClick={() => void flow.fitView({ padding: 0.2, duration: 200 })}>보기 초기화</button>
        {narrow ? <button type="button" className="btn" aria-pressed={phoneView} onClick={() => setPhoneView(!phoneView)}>그림으로 보기</button>
          : <button type="button" className="btn" aria-pressed={listOn} onClick={() => setListOn(!listOn)}>목록 모드(키보드 · 화면 읽기)</button>}
      </div>
      {unread ? <p className="notice studio-note" role="status">{unread.kept ? "지난 초안을 읽지 못해 새 판으로 열었어요. 지난 초안은 지우지 않고 이 브라우저에 따로 보관했어요."
        : "지난 초안을 읽지 못해 새 판으로 열었어요. 따로 보관할 자리가 없어 지난 초안을 그대로 두었어요. 이 판을 고치기 시작하면 그 위에 저장돼요."}</p> : null}
      {guest ? <p className="notice studio-note" role="status">로그인 전이에요. 판은 이 브라우저에만 남고, 기술은 아래 기술 탭의 &quot;카탈로그에서 찾기&quot;로 넣어요. 내보내기 복사는 그대로 되고, 확정 · 템플릿 · AI 점검은 <a href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a>하면 돼요.</p> : null}
      {guestDraft ? <p className="notice studio-note" role="status">로그인 전에 이 브라우저에서 만들던 판 &quot;{guestDraft.name}&quot;이 있어요. 가져올까요? 지금 판은 되돌리기로 돌아와요.{" "}
        <button type="button" className="btn" onClick={() => answerGuest(true)}>가져오기</button> <button type="button" className="btn" onClick={() => answerGuest(false)}>버리기</button></p> : null}
      {step === 1 ? (
        <form className="studio-add" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) addNamed(newName.trim()); }}>
          <label>새 단계 <input value={newName} maxLength={20} placeholder="예: 리서치" onChange={(e) => setNewName(e.target.value)} /></label>
          <button type="submit" className="btn btn-primary" disabled={!newName.trim()}>{base ? "고른 단계 다음에 더하기" : "단계 더하기"}</button>
          {hints.map((h) => <button key={h} type="button" className="chip" onClick={() => addNamed(h)}>+ {h}</button>)}
          <button type="button" className="btn" onClick={() => setAsking(true)}>질문으로 틀 만들기</button>
        </form>
      ) : null}
      <div className="studio-main" data-list={listMode ? "" : undefined}>
        {listMode ? <div className="studio-list"><ListMode {...panel} /></div> : (
          <div className="studio-canvas" role="region" tabIndex={-1} onKeyDown={onCanvasKey} aria-label="청사진 캔버스. 단계를 끌어 옮기고, 오른쪽 점에서 다른 단계의 왼쪽 점으로 끌어 순서를 이어요. 키보드 · 화면 읽기는 목록 모드를 쓰세요">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={readOnly ? undefined : onConnect} onConnectEnd={readOnly ? undefined : onConnectEnd} isValidConnection={(c) => !readOnly && connectProblem(g, c.source, c.target) === null}
              onDelete={onDelete} onPaneClick={unpick} deleteKeyCode={null} selectionOnDrag={!readOnly} panOnDrag={readOnly ? true : [1, 2]} panActivationKeyCode="Space"
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
      {step === 3 ? <StepResult name={name.trim() || "이름 없는 청사진"} board={board} problems={problems} say={say} onConfirm={guest ? () => toLogin("확정하려면") : () => { done.reset(); setConfirming(true); }} /> : null}
      <Dock {...panel} />
      <ToastLine toast={toast} clear={clear} className="c-toast-float" />
      {asking ? <InterviewDialog replacing={g.stages.length > 0} onClose={() => setAsking(false)} onMake={(cols) => makeFromAnswers(cols)} /> : null}
      {confirming && board ? <ConfirmDialog name={name.trim() || "이름 없는 청사진"} board={board} projects={projects} busy={done.busy} error={done.error}
        onConfirm={(p) => void done.confirm(name.trim() || "이름 없는 청사진", p, g, templateId)} onClose={() => setConfirming(false)} /> : null}
      {loginAsk ? <AskDialog title="로그인할까요?" yes="로그인하러 가기" onYes={() => { setLoginAsk(null); router.push(`/login?next=${encodeURIComponent("/blueprint")}`); }} onClose={() => setLoginAsk(null)}>
        <p>{loginAsk} 로그인이 필요해요. 지금 판은 이 브라우저에 그대로 두고, 로그인한 뒤 가져올 수 있어요.</p>
      </AskDialog> : null}
    </div>
  );
}
