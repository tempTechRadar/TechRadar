"use client";
// 청사진 스튜디오(P-12e): React Flow 캔버스 위 단계 노드 + 연결선(순서). 그래프는 lib/blueprint/graph.ts 순수 함수로만 바꾸고(apply 하나),
// 되돌리기 · 초안은 use-studio-graph. 단축키는 Esc(고른 것 풀기) · Delete(지우기) · 스페이스(손 모드)만, 나머지는 단추(사용자 결정).
// 빈 곳 끌기 = 여러 개 고르기(피그마식), 가운데 · 오른쪽 단추나 스페이스 + 끌기 = 화면 옮기기, 휠 = 커서 기준 확대.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Background, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge as FlowEdge, type EdgeChange, type FinalConnectionState, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  applyTemplate, autoLayout, LIMITS, NODE_SIZE, connect, renameStage, fromV1, connectProblem, disconnect, layers, limitProblems, putTech, removeStage, removeTech, toBoardView,
  type Graph, type Pos, type TemplateKind,
} from "@/lib/blueprint/graph";
import { fromNames } from "@/lib/blueprint/board";
import { BLUEPRINT_GATE, recommendAt } from "@/lib/blueprint/knowledge";
import { addStageAfter, addStageLinked, besideSpot, CONNECT_KO, linkSaid, nameProblem, neighbors, parallelProblem, putProblem, putSaid, removeSaid, removedStageSaid, renamedSaid, sideSpot } from "@/lib/blueprint/panel-view";
import { STAGE_NAME_MAX } from "@/lib/blueprint/board";
import type { BlueprintPage, PoolTech } from "@/lib/server/blueprints";
import { ToastLine, useToast } from "../undo-toast";
import { markTech } from "../tech-map/actions";
import { AskDialog } from "../c-dialog";
import { InterviewDialog } from "./dialogs";
import { Dock } from "./dock";
import { GuideLines, useDragAssist } from "./drag-assist";
import { GhostStage, type Ghost } from "./ghost-stage";
import { Inspector } from "./inspector";
import { ListMode } from "./list-mode";
import { StageNode, type StageNodeType } from "./stage-node";
import { ResultDialog, type CheckTarget } from "./result-dialog";
import { SeqEdge, type SeqEdgeType } from "./seq-edge";
import type { PanelProps, Picked } from "./studio-types";
import { useStudioGraph } from "./use-studio-graph";
import { useConfirm } from "./use-studio-save";
import { useBounce } from "./use-bounce";
import "./studio.css";

const nodeTypes = { stage: StageNode };
const edgeTypes = { seq: SeqEdge };
const posOf = (g: Graph) => new Map(g.stages.map((s) => [s.id, { x: s.x, y: s.y }]));
/** 움직임 줄이기(P-12g B1): CSS의 --dur 0s는 카메라 이동(fitView) · 클래스 붙이기 같은 JS 움직임에 닿지 않아 따로 본다(지도 controller.ts와 같은 방식) */
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 확정 선 긋기(B2) 한 번의 길이: studio.css se-draw(--dur × 2)보다 조금 길게 두고 클래스를 뗀다 */
const DRAW_MS = 600;
/** 화면 맞춤(P-12h-2 T1): 단계가 많아도 너무 작게 줄이지 않고(0.75 아래로 안 감) 끌어서 본다 */
const FIT = { padding: 0.15, minZoom: 0.75, maxZoom: 1.2 };
const READ_ONLY = "그림으로 보기에서는 고칠 수 없어요. 그림으로 보기를 끄고 목록으로 고쳐 주세요.";
const NO_CANVAS = "목록으로 편집하는 중에는 캔버스가 없어요. 그림으로 돌아가면 쓸 수 있어요.";

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
  const [picked, setPicked] = useState<Picked>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()), [selEdges, setSelEdges] = useState<Set<string>>(new Set());
  // shortcut: 끄는 동안의 위치를 이 컴포넌트 상태에 둬서 포인터가 움직일 때마다 패널까지 다시 그린다. 단계가 수십 개를 넘어 끌기가 버벅이면 캔버스 자식으로 내리거나 패널을 memo한다
  const [drag, setDrag] = useState<Map<string, Pos> | null>(null);
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(new Map()); // 잰 노드 크기(미니맵이 씀)
  const [newName, setNewName] = useState(""), [adding, setAdding] = useState(false); // 위 막대 "＋ 단계"의 이름 칸(작은 팝오버, S3 전까지)
  const addBtn = useRef<HTMLButtonElement>(null), canvasBox = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null); // 옅은 새 단계 블록(S3: 선을 빈 곳에 놓음 · 위아래 +)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null), edgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bounce = useBounce();
  // 서랍(P-12h-2 T1): 기본 닫힘, 기술 칩 · 카드 "자세히"로 열림. 열면 초점이 서랍으로, 닫으면 연 자리로
  const [drawer, setDrawer] = useState(false), drawerFrom = useRef<HTMLElement | null>(null), drawerBox = useRef<HTMLElement>(null);
  const [drawerAt, setDrawerAt] = useState<{ n: number; note: boolean }>({ n: 0, note: false }); // 열 때마다 n이 늘어 이미 열린 서랍도 초점을 옮김
  useEffect(() => { if (drawer) drawerBox.current?.querySelector<HTMLElement>(drawerAt.note ? "#insp-note" : ".insp")?.focus(); }, [drawer, drawerAt]);
  const [editing, setEditing] = useState<string | null>(null); // 카드 위에서 이름 바꾸는 단계
  const now = useRef(graph); // 지우기 토스트의 되돌리기: 그 뒤에 판이 바뀌었는지 본다
  now.current = graph;
  const [loginAsk, setLoginAsk] = useState<string | null>(null); // 손님이 저장 · 판단을 누름: 무엇을 하려는지(묻는 대화상자 글)
  const [confirming, setConfirming] = useState(false), [asking, setAsking] = useState(false), [marking, setMarking] = useState<string | null>(null);
  const { toast, say, clear } = useToast();
  const assist = useDragAssist();
  const [found, setFound] = useState<PoolTech[]>([]); // 손님이 카탈로그에서 찾은 기술: 끌어 놓을 수 있게 info에만 더한다(손님 서랍)
  const info = useMemo(() => new Map([...found, ...pool].map((t) => [t.id, t])), [pool, found]);
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  // B2 확정 = 설계선 긋기: 실제 선은 그대로 두고 덧칠 선만 한 번 그었다가 사라진다. 같은 확정 id(같은 내용 다시 확정, 불변 3)면 긋지 않는다
  const [drawing, setDrawing] = useState(false);
  const lastConfirmed = useRef<string | null>(null), drawTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined), layOk = useRef(false);
  useEffect(() => () => { clearTimeout(drawTimer.current); clearTimeout(edgeTimer.current); }, []);
  // B3 후보 칩: 판단이 저장된 뒤 서랍을 다시 읽는 동안에도 "고르는 중…"을 지킨다(그 틈에 "안 고른" 모양으로 돌아가 보이지 않게)
  const [settling, setSettling] = useState<{ id: string; name: string } | null>(null);
  const settled = useRef(new Set<string>()); // 저장은 됐고 서랍을 다시 읽는 중인 기술(같은 기술을 또 보내지 않게, 불변 3)
  const [refreshing, startRefresh] = useTransition();
  // 실패 문구는 확정 창이 열려 있으면 창 안에만, 창을 닫은 뒤 왔으면 알림으로(같은 말을 두 번 보이지 않게)
  const confirmOpen = useRef(false);
  confirmOpen.current = confirming;
  const done = useConfirm((id) => {
    // 결과물 창은 열어 둔다(P-12h S1: 확정 → 같은 창 ④ AI 점검이 방금 확정한 것으로 바뀜)
    const fresh = id !== lastConfirmed.current;
    lastConfirmed.current = id; setConfirmedId(id);
    // 저장이 성공해 onDone이 불렸을 때만(실패면 이 함수가 안 불림, 불변 4) · 처음 보는 확정 id · 고리 없는 판 · 움직임 줄이기 아님
    if (fresh && layOk.current && !calm()) { setDrawing(true); clearTimeout(drawTimer.current); drawTimer.current = setTimeout(() => setDrawing(false), DRAW_MS); }
    say("확정해서 내 이력에 남겼어요. 아래 AI 점검에서 점검을 받을 수 있어요."); router.refresh();
  },
    (m) => { if (!confirmOpen.current) say(m); });
  const lay = useMemo(() => (graph ? layers(graph) : null), [graph]);
  layOk.current = lay?.ok ?? false;
  // 다시 읽기가 끝나면: 서랍에 들어왔으면 실선 칩, 아니면 점선 그대로(사실대로). 초점이 갈 곳을 잃었으면(body) 바뀐 칩으로
  useEffect(() => {
    if (refreshing || !settling) return;
    const name = settling.name;
    settled.current.clear(); setSettling(null);
    if (document.activeElement !== document.body) return;
    document.querySelector<HTMLElement>(`.sn button.tc-main[aria-label^="${CSS.escape(name)},"]`)?.focus();
  }, [refreshing, settling]);
  const busyId = marking ?? (refreshing ? settling?.id ?? null : null);
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
  const apply = (next: Graph, message?: string, nm?: string, merge?: boolean) => {
    if (next === g && (nm === undefined || nm === name)) return;
    bounce.stop(); // 튕겨 가던 자리는 버리고 새 판 그대로
    push(next, nm, merge);
    if (nm !== undefined) setTemplateId(null);
    if (message) say(message); else clear();
  };
  const stageOf = (id: string) => g.stages.find((s) => s.id === id);
  /** 막힌 단추 한 벌(P-12h S4, page.css): aria-disabled + 누르면 이유 글. disabled와 달리 Tab으로 닿아 이유를 들을 수 있다 */
  const gate = (why: string | null, run: () => void) => ({ "aria-disabled": why ? true : undefined, title: why ?? undefined, onClick: () => (why ? say(why) : run()) });

  /** 손님이 저장 · 판단을 누르면: 판은 이 브라우저(손님 초안)에 그대로 두고 로그인으로. 로그인한 뒤 청사진에서 가져올지 묻는다 */
  const toLogin = (what: string) => setLoginAsk(what);
  /** 후보 칩의 "적용 후보로 고르기": 지도와 같은 판단 저장(markTech). 성공하면 서랍(관문 목록)을 다시 읽어 보통 칩이 된다 */
  async function markCandidate(techId: string, techName: string) {
    if (guest) return toLogin("적용 후보로 고르려면");
    if (inflight.current.has(techId) || settled.current.has(techId)) return; // 같은 기술을 겹쳐 보내지 않게(다른 기술을 고르는 사이 단추가 다시 켜져도)
    inflight.current.add(techId); setMarking(techId);
    const r = await markTech(techId, "candidate", "").catch(() => ({ ok: false as const, message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." }));
    inflight.current.delete(techId); setMarking((m) => (m === techId ? null : m));
    if (r.ok) { say(`${techName}을(를) 적용 후보로 골랐어요.`); settled.current.add(techId); setSettling({ id: techId, name: techName }); startRefresh(() => router.refresh()); } else say(r.message); // 실패면 점선 그대로(불변 4)
  }
  function dropTech(stageId: string, techId: string) {
    const t = info.get(techId), s = stageOf(stageId);
    if (!t || !s) return say(BLUEPRINT_GATE);
    const why = putProblem(s, t);
    if (why) return say(why);
    apply(putTech(g, stageId, { id: t.id, name: t.name }), putSaid(s.name, t.name));
  }
  const base = picked ? stageOf(picked.stageId) : undefined; // 되돌리기 뒤 사라진 단계를 가리키면 없는 것으로
  /** ＋ 단계 칸 닫기: 초점이 사라진 입력에서 body로 떨어지지 않게 단추로 돌려놓는다 */
  function closeAdd() { addBtn.current?.focus(); setAdding(false); } // 칸이 사라지기 전에 옮긴다(다음 프레임으로 미루면 백그라운드 탭에서 안 옴)
  /** 새 단계: 고른 단계가 있으면 그 다음에 이어 붙인다(목록 모드와 같은 규칙, panel-view addStageAfter). 더한 단계를 고른 채로 둬서 연달아 이어 붙일 수 있게 */
  function addNamed(nm: string) {
    const r = addStageAfter(g, nm, base);
    if ("problem" in r) return say(r.problem);
    apply(r.graph, base && r.linked ? `"${base.name}" 다음에 "${r.stage.name}" 단계를 더하고 이었어요.` : base ? `"${r.stage.name}" 단계를 더했지만 선은 잇지 못했어요(연결은 ${LIMITS.edges}개까지).` : `"${r.stage.name}" 단계를 더했어요.`);
    setNewName(""); closeAdd(); setPicked({ kind: "stage", stageId: r.stage.id }); setSel(new Set([r.stage.id]));
  }
  /** 옅은 블록에 이름을 적고 Enter: 단계 + 선을 한 번의 apply로(되돌리기 한 칸). 더한 단계를 고른 채로 */
  function commitGhost(gh: Ghost, nm: string) {
    setGhost(null);
    const r = addStageLinked(g, nm, gh.at, gh);
    if ("problem" in r) return say(r.problem);
    const n = r.stage.name, want = gh.before.length + gh.after.length;
    apply(r.graph, want && !r.linked ? `"${n}" 단계를 더했지만 선은 잇지 못했어요(연결은 ${LIMITS.edges}개까지).`
      : gh.kind === "after" ? `"${gh.of}" 다음에 "${n}" 단계를 더하고 이었어요.` : gh.kind === "before" ? `"${gh.of}" 앞에 "${n}" 단계를 더해 이었어요.` : `"${gh.of}"와(과) 같은 순서에 "${n}" 단계를 더했어요.`);
    setPicked({ kind: "stage", stageId: r.stage.id }); setSel(new Set([r.stage.id]));
  }
  /** 옅은 블록 열기: 그 자리 순서에 맞는 추천 이름(gap = 그 번호 열 앞), 지금 초점 자리(끝나면 돌아감) */
  const openGhost = (gh: Omit<Ghost, "hints" | "from">, gap: number | null) => setGhost({ ...gh,
    hints: board ? recommendAt(board, gap ?? board.length).slice(0, 4) : [], from: document.activeElement instanceof HTMLElement ? document.activeElement : null });
  const depthOf = (id: string) => (lay?.ok ? lay.depth.get(id) ?? null : null);
  /** 블록 위 · 아래 +: 같은 순서(앞 단계 선 복사)에 옅은 블록. 같은 순서가 이미 가득이면 띄우지 않고 이유 */
  function besideGhost(id: string, dir: -1 | 1) {
    const s = stageOf(id), why = parallelProblem(g, id);
    if (!s) return;
    if (why) return say(why);
    openGhost({ at: besideSpot(g, s, dir), kind: "beside", of: s.name, before: neighbors(g, id).before.map((x) => x.id), after: [] }, depthOf(id));
  }
  /** 카드 왼쪽 · 오른쪽 +: 앞 · 다음 단계 옅은 블록(선 끌기와 같은 addStageLinked) */
  function sideGhost(id: string, dir: -1 | 1) {
    const s = stageOf(id), d = depthOf(id);
    if (!s) return;
    openGhost({ at: sideSpot(g, s, dir), kind: dir < 0 ? "before" : "after", of: s.name, before: dir < 0 ? [] : [id], after: dir < 0 ? [id] : [] }, d === null ? null : dir < 0 ? d : d + 1);
  }
  const focusNode = (id: string) => document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.focus();
  /** 카드 "✕": 확인 창 없이 지우고 토스트에 되돌리기. 그 뒤에 판이 바뀌었으면 되돌리지 않고 위 되돌리기를 안내 */
  function removeFromCard(id: string) {
    const s = stageOf(id);
    if (!s) return;
    const next = removeStage(g, id);
    canvasBox.current?.focus(); // 누른 단추가 카드와 함께 사라지므로
    if (picked?.stageId === id) unpick();
    setSel((x) => { const n = new Set(x); n.delete(id); return n; }); // 여럿 고른 채 지워도 사라진 단계가 남지 않게
    setSelEdges((x) => new Set([...x].filter((e) => !e.split(">").includes(id))));
    apply(next);
    say(removedStageSaid(s.name), () => { if (now.current === next) { bounce.stop(); undo(); say(`"${s.name}" 단계를 살렸어요.`); } else say("그 뒤에 판이 바뀌어 여기서는 되돌릴 수 없어요. 위 \"되돌리기\"를 써 주세요."); });
  }
  /** 카드 위 이름 칸이 끝남: 검사는 서랍 · 목록과 같은 nameProblem, 초점은 그 카드로 */
  function renameOnCard(id: string, nm: string | null) {
    focusNode(id); setEditing(null);
    const s = stageOf(id);
    if (nm === null || !s || nm.trim() === s.name) return;
    const why = nameProblem(nm);
    if (why) return say(why);
    apply(renameStage(g, id, nm), renamedSaid(nm));
  }
  const openDrawer = (note = false) => {
    if (!drawer) drawerFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer(true); setDrawerAt((x) => ({ n: x.n + 1, note }));
  };
  const closeDrawer = () => { const f = drawerFrom.current; (f?.isConnected && f !== document.body ? f : canvasBox.current)?.focus(); setDrawer(false); };
  /** Enter · Esc 뒤 초점: 연 곳(+ 단추)이 아직 있으면 거기, 아니면 캔버스 */
  const ghostBack = (gh: Ghost) => (gh.from?.isConnected && gh.from !== document.body ? gh.from : canvasBox.current)?.focus();
  /** 반동 자동 정렬: 판은 바로, 화면은 튕겨 간 뒤 맞춰 보기. 움직임 줄이기면 바로 맞춤 */
  function arrange() {
    const next = autoLayout(g);
    if (next === g) return say("바꿀 자리가 없어요. 이미 정렬됐거나 선이 고리로 이어져 있어요.");
    apply(next, "순서대로 정렬했어요.");
    const fit = () => void flow.fitView({ ...FIT, duration: calm() ? 0 : 200 });
    if (calm()) requestAnimationFrame(fit); else bounce.start(posOf(g), posOf(next), fit);
  }
  const pickedOrder = picked && lay?.ok ? lay.depth.get(picked.stageId) ?? null : null;
  const hints = board ? recommendAt(board, pickedOrder === null ? board.length : pickedOrder + 1).slice(0, 4) : [];

  const nodes: StageNodeType[] = g.stages.map((s) => ({
    id: s.id, type: "stage", position: drag?.get(s.id) ?? bounce.at?.get(s.id) ?? { x: s.x, y: s.y }, selected: sel.has(s.id), measured: dims.get(s.id),
    data: { stage: s, order: lay?.ok ? lay.depth.get(s.id) ?? null : null, picked, info, readOnly, onPick: (p) => { setPicked(p); if (p?.kind === "tech") openDrawer(); }, onDropTech: dropTech, onRemoveTech: (sid, tid) => apply(removeTech(g, sid, tid), removeSaid(stageOf(sid)?.name ?? "", g.stages.find((x) => x.id === sid)?.techs.find((x) => x.id === tid)?.name ?? "")),
      onCandidate: (tid, tn) => void markCandidate(tid, tn), marking: busyId, besideBlocked: readOnly ? null : parallelProblem(g, s.id), onBeside: readOnly ? undefined : besideGhost,
      edit: readOnly ? undefined : { onSide: sideGhost, onDetail: (id) => { pick({ kind: "stage", stageId: id }); openDrawer(); }, onRemove: removeFromCard,
        onNote: (id) => { pick({ kind: "stage", stageId: id }); openDrawer(true); },
        editing: editing === s.id, onEdit: setEditing, onRename: renameOnCard } },
  }));
  // 선 위에 마우스: 가운데 "끊기". 선에서 단추로 옮기는 틈(150ms)에는 지킨다
  const leaveEdge = () => { clearTimeout(edgeTimer.current); edgeTimer.current = setTimeout(() => setHoverEdge(null), 150); };
  const keepEdge = (id: string) => { clearTimeout(edgeTimer.current); setHoverEdge(id); };
  const edges: (FlowEdge | SeqEdgeType)[] = g.edges.map((e) => {
    const id = `${e.from}>${e.to}`, on = selEdges.has(id) || sel.has(e.from) || sel.has(e.to);
    return { id, type: "seq", source: e.from, target: e.to, selected: selEdges.has(id), className: `${on ? "se se-on" : "se"}${drawing ? " se-draw" : ""}`, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10 },
      data: { label: `${stageOf(e.from)?.name ?? ""} → ${stageOf(e.to)?.name ?? ""}`, hover: hoverEdge === id, onKeep: () => keepEdge(id), onLeave: leaveEdge,
        // 속성 패널 "끊기"와 같게: 고른 단계는 그대로, 사라지는 단추 대신 캔버스로 초점
        onCut: readOnly ? undefined : () => { canvasBox.current?.focus(); setHoverEdge(null); setSelEdges((x) => { const n = new Set(x); n.delete(id); return n; });
          apply(disconnect(g, e.from, e.to), linkSaid(g, e.from, e.to, true)); } } };
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
    if (raw.size) { bounce.stop(); moved = new Map([...(moved ?? []), ...placed]); }
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
  const onConnect = (c: Connection) => { const p = connectProblem(g, c.source, c.target); if (p) say(CONNECT_KO[p]); else apply(connect(g, c.source, c.target), linkSaid(g, c.source, c.target, false)); };
  /** 빈 곳에 놓았으면(S3) 그 자리에 옅은 새 단계: 오른쪽 점에서 끌면 다음 단계, 왼쪽 점에서 끌면 앞 단계.
   *  못 잇는 곳에 놓았으면(isValidConnection이 막아 onConnect가 안 불림) 이유를 알린다. 들어오는 점에서 끌었으면 방향을 뒤집어 본다 */
  const onConnectEnd = (ev: MouseEvent | TouchEvent, st: FinalConnectionState) => {
    if (st.isValid === null && !st.toNode && st.fromNode) {
      const pt = "changedTouches" in ev ? ev.changedTouches[0] : ev;
      if (!pt) return;
      const p = flow.screenToFlowPosition({ x: pt.clientX, y: pt.clientY }), back = st.fromHandle?.type === "target", of = st.fromNode.id;
      const d = depthOf(of);
      openGhost({ at: { x: back ? p.x - NODE_SIZE.w : p.x, y: p.y - NODE_SIZE.h / 2 }, kind: back ? "before" : "after", of: stageOf(of)?.name ?? "", before: back ? [] : [of], after: back ? [of] : [] },
        d === null ? null : back ? d : d + 1);
      return;
    }
    if (st.isValid !== false || !st.fromNode || !st.toNode) return;
    const [from, to] = st.fromHandle?.type === "target" ? [st.toNode.id, st.fromNode.id] : [st.fromNode.id, st.toNode.id];
    const p = connectProblem(g, from, to);
    if (p) say(CONNECT_KO[p]);
  };
  function onDelete({ nodes: ns, edges: es }: { nodes: { id: string }[]; edges: { source: string; target: string }[] }) {
    let next = g;
    for (const e of es) next = disconnect(next, e.source, e.target);
    for (const n of ns) next = removeStage(next, n.id);
    apply(next, ns.length ? `단계 ${ns.length}개를 지웠어요. 되돌리기로 살릴 수 있어요.` : es.length === 1 ? linkSaid(g, es[0].source, es[0].target, true) : `연결 ${es.length}개를 끊었어요.`);
    setSel(new Set()); setSelEdges(new Set()); setPicked(null);
  }
  /** 질문 6개의 답으로 만든 틀(11-21 사용자 결정, 하단 패널 불러오기 탭에서 엶). 지금 판이 있으면 대화상자 마지막에 "바꾸기"로 묻고, 되돌리기 한 칸이면 전 판 */
  function makeFromAnswers(cols: string[][]) {
    setAsking(false); unpick(); setTemplateId(null);
    apply(fromV1(fromNames(cols)), "질문 답으로 틀을 만들었어요. 되돌리기를 누르면 전 판으로 돌아가요.");
  }
  const unpick = () => { setSel(new Set()); setSelEdges(new Set()); setPicked(null); };
  /** 지우기 키: 캔버스 안에 초점이 있을 때만(React Flow의 deleteKeyCode는 문서 전체에서 들어 패널 · 확정 창에서도 지워짐). Mac의 delete = Backspace */
  function onCanvasKey(e: React.KeyboardEvent) {
    // 카드에 초점이 있을 때 F2 · Enter = 카드 위 이름 바꾸기(React Flow는 Enter로 고르기도 한다)
    const node = e.target instanceof HTMLElement && e.target.classList.contains("react-flow__node") ? e.target.dataset.id : undefined;
    if (!readOnly && node && (e.key === "F2" || e.key === "Enter")) { e.preventDefault(); setEditing(node); return; }
    if (readOnly || (e.key !== "Delete" && e.key !== "Backspace") || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!sel.size && !selEdges.size) return;
    e.preventDefault();
    onDelete({ nodes: [...sel].map((id) => ({ id })), edges: edges.filter((x) => selEdges.has(x.id)) });
  }
  // 관문 밖 기술(서랍 = 내 기술 · 적용 후보 · 이력에 없음, 남의 조합 템플릿에서 온 것)이 남아 있으면 확정을 막는다(DB도 거절)
  const outside = new Set(g.stages.flatMap((s) => s.techs.filter((t) => !info.has(t.id)).map((t) => t.id)));
  // 손님은 관문이 없어 모든 기술이 밖이다: 막지 않고 확정을 누르면 로그인 안내
  const problems = [...(g.stages.length ? [] : ["단계를 하나 이상 만들어 주세요."]), ...limitProblems(g), ...(outside.size && !guest ? [`판단 안 한 기술 ${outside.size}개 — 적용 후보로 고르거나 빼 주세요.`] : [])];
  // AI 점검할 확정본: 이 화면에서 방금 확정한 것, 없으면 최근 확정 이력(새로 고쳐도 "먼저 확정해 주세요"로 막히지 않게, P-12h S1)
  // 새로 고친 뒤에는 이 판의 확정 id를 모르므로(확정 id는 이 화면에서만 기억) 최근 확정본이 지금 판과 같은 내용인지(단계 순서 · 이름 · 기술)를 보고 알린다
  const latest = history?.[0];
  const sameAsBoard = (h: NonNullable<typeof latest>) => board !== null && JSON.stringify(h.board.map((c) => c.map((s) => [s.name, s.techs.map((t) => t.id)])))
    === JSON.stringify(board.map((c) => c.map((s) => [s.name, s.techs.map((t) => t.id)])));
  const checkTarget: CheckTarget = confirmedId ? { id: confirmedId, label: "방금 확정한 것" }
    : history === null ? "unknown"
    : latest ? { id: latest.id, label: `최근 확정 "${latest.name}" (${new Date(latest.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })})${sameAsBoard(latest) ? " — 지금 판과 같아요" : " — 지금 판과 달라요. 지금 판을 점검하려면 먼저 확정해 주세요"}` } : null;
  /** 패널에서 고르면 캔버스에서도 그 단계를 고른 모양으로 */
  function pick(p: Picked) { setPicked(p); setSel(p ? new Set([p.stageId]) : new Set()); if (p?.kind === "tech") openDrawer(); } // 기술을 고르면 서랍이 열림(단계만 고르면 안 열림)
  const panel: PanelProps = { graph: g, picked, onPick: pick, onAsk: () => setAsking(true), projects, apply, pool, tags, onTags: (id, t) => setTags((x) => (x ? { ...x, [id]: t } : x)), history, say,
    onCandidate: (tid, tn) => void markCandidate(tid, tn), marking: busyId,
    guest, onFound: guest ? (ts) => setFound((x) => [...x, ...ts.filter((t) => !x.some((y) => y.id === t.id))]) : undefined };

  return (
    <div className="studio" onKeyDown={(e) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) unpick(); }}>
      <div className="studio-bar">
        <label className="sr-only" htmlFor="bp-name">청사진 이름</label>
        <input id="bp-name" className="bp-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn" {...gate(canUndo ? null : "되돌릴 것이 없어요.", () => { bounce.stop(); undo(); })}>되돌리기</button>
        <button type="button" className="btn" {...gate(canRedo ? null : "다시 할 것이 없어요.", () => { bounce.stop(); redo(); })}>다시</button>
        {/* ＋ 단계: 고른 단계가 있으면 그 다음에 이어 붙임. 이름은 작은 입력(추천 이름은 datalist), Esc로 닫기 */}
        <span className="studio-addwrap">
          <button ref={addBtn} type="button" className="btn" aria-expanded={adding && !readOnly} {...gate(readOnly ? READ_ONLY : null, () => setAdding(!adding))}>＋ 단계</button>
          {adding && !readOnly ? (
            <form className="studio-addpop" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) addNamed(newName.trim()); else say("단계 이름을 적어 주세요."); }}
              onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeAdd(); } }}
              onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null) && e.relatedTarget !== addBtn.current) setAdding(false); }}>
              <label>{base ? `"${base.name}" 다음 단계 이름` : "새 단계 이름"}
                <input autoFocus value={newName} maxLength={STAGE_NAME_MAX} list="studio-hints" placeholder="예: 리서치" onChange={(e) => setNewName(e.target.value)} />
              </label>
              <datalist id="studio-hints">{hints.map((h) => <option key={h} value={h} />)}</datalist>
              <button type="submit" className="btn btn-primary" aria-disabled={newName.trim() ? undefined : true}>더하기</button>
            </form>
          ) : null}
        </span>
        <button type="button" className="btn" {...gate(listMode ? NO_CANVAS : readOnly ? READ_ONLY : null, arrange)}>자동 정렬</button>
        <button type="button" className="btn" {...gate(listMode ? NO_CANVAS : null, () => void flow.fitView({ ...FIT, duration: calm() ? 0 : 200 }))}>보기 초기화</button>
        {narrow ? <button type="button" className="btn" aria-pressed={phoneView} onClick={() => setPhoneView(!phoneView)}>그림으로 보기</button>
          : null}{/* 넓은 화면의 목록 편집 켜기는 하단 패널 탭 줄 끝 작은 링크로(11-22 사용자: 기능은 두고 단추만 내리기) */}
        <span className="studio-grow" />
        <button type="button" className="btn btn-primary" onClick={() => { done.reset(); setConfirming(true); }}>확정 · 내보내기</button>
      </div>
      {unread ? <p className="notice studio-note" role="status">{unread.kept ? "지난 초안을 읽지 못해 새 판으로 열었어요. 지난 초안은 지우지 않고 이 브라우저에 따로 보관했어요."
        : "지난 초안을 읽지 못해 새 판으로 열었어요. 따로 보관할 자리가 없어 지난 초안을 그대로 두었어요. 이 판을 고치기 시작하면 그 위에 저장돼요."}</p> : null}
      {guest ? <p className="notice studio-note" role="status">로그인 전이에요. 판은 이 브라우저에만 남고, 기술은 아래 기술 탭의 &quot;카탈로그에서 찾기&quot;로 넣어요. 내보내기 복사는 그대로 되고, 확정 · 템플릿 · AI 점검은 <a href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a>하면 돼요.</p> : null}
      {guestDraft ? <p className="notice studio-note" role="status">로그인 전에 이 브라우저에서 만들던 판 &quot;{guestDraft.name}&quot;이 있어요. 가져올까요? 지금 판은 되돌리기로 돌아와요.{" "}
        <button type="button" className="btn" onClick={() => answerGuest(true)}>가져오기</button> <button type="button" className="btn" onClick={() => answerGuest(false)}>버리기</button></p> : null}
      <div className="studio-main" data-list={listMode ? "" : undefined}>
        {listMode ? <div className="studio-list"><ListMode {...panel} /></div> : (
          <div ref={canvasBox} className="studio-canvas" role="region" tabIndex={-1} onKeyDown={onCanvasKey} aria-label="청사진 캔버스. 단계를 끌어 옮기고, 오른쪽 점에서 다른 단계의 왼쪽 점으로 끌어 순서를 이어요. 빈 곳에 놓으면 새 단계가 생겨요. 키보드 · 화면 읽기는 하단 패널의 '키보드로 편집'을 쓰세요">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onEdgeMouseEnter={readOnly ? undefined : (_, e) => keepEdge(e.id)} onEdgeMouseLeave={readOnly ? undefined : leaveEdge}
              onConnect={readOnly ? undefined : onConnect} onConnectEnd={readOnly ? undefined : onConnectEnd} isValidConnection={(c) => !readOnly && connectProblem(g, c.source, c.target) === null}
              onDelete={onDelete} onPaneClick={() => { setGhost(null); unpick(); }} deleteKeyCode={null} selectionOnDrag={!readOnly} panOnDrag={readOnly ? true : [1, 2]} panActivationKeyCode="Space"
              nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable={!readOnly} edgesFocusable={false}
              minZoom={0.3} maxZoom={2} fitView fitViewOptions={FIT} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}>
              <Background gap={16} size={1} />
              <GuideLines guides={assist.guides} />
              {ghost && !readOnly ? <GhostStage key={`${ghost.at.x},${ghost.at.y}`} ghost={ghost} back={() => ghostBack(ghost)}
                onCommit={(nm) => commitGhost(ghost, nm)} onCancel={() => setGhost(null)} /> : null}
              {narrow ? null : <MiniMap position={drawer ? "bottom-left" : "bottom-right"} pannable zoomable ariaLabel="미니맵" className="studio-mini" bgColor="var(--surface)" nodeColor="var(--faint)" maskColor="rgba(0, 0, 0, 0.06)" />}
            </ReactFlow>
          </div>
        )}
        {narrow || !drawer ? null : (
          <section ref={drawerBox} className="studio-insp" aria-label="속성 서랍" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeDrawer(); } }}>
            <div className="studio-insp-bar"><button type="button" className="btn btn-sm" onClick={closeDrawer}>닫기 ✕</button></div>
            <Inspector {...panel} />
          </section>
        )}
      </div>
      <Dock {...panel} listEdit={narrow ? undefined : { on: listOn, flip: () => setListOn(!listOn) }} />
      <ToastLine toast={toast} clear={clear} className="c-toast-float" />
      {asking ? <InterviewDialog replacing={g.stages.length > 0} onClose={() => setAsking(false)} onMake={(cols) => makeFromAnswers(cols)} /> : null}
      {confirming ? <ResultDialog name={name.trim() || "이름 없는 청사진"} board={board} problems={problems} projects={projects} busy={done.busy} error={done.error} guest={guest}
        check={checkTarget} say={say} onLogin={() => { setConfirming(false); toLogin("확정하려면"); }}
        onConfirm={(p) => void done.confirm(name.trim() || "이름 없는 청사진", p, g, templateId)} onClose={() => setConfirming(false)} /> : null}
      {loginAsk ? <AskDialog title="로그인할까요?" yes="로그인하러 가기" onYes={() => { setLoginAsk(null); router.push(`/login?next=${encodeURIComponent("/blueprint")}`); }} onClose={() => setLoginAsk(null)}>
        <p>{loginAsk} 로그인이 필요해요. 지금 판은 이 브라우저에 그대로 두고, 로그인한 뒤 가져올 수 있어요.</p>
      </AskDialog> : null}
    </div>
  );
}
