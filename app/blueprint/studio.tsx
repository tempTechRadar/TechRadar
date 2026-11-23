"use client";
// 청사진 스튜디오(P-12e): React Flow 캔버스 위 단계 노드 + 연결선(순서). 그래프는 lib/blueprint/graph.ts 순수 함수로만 바꾸고(apply 하나),
// 되돌리기 · 초안은 use-studio-graph. 단축키는 Esc(고른 것 풀기) · Delete(지우기) · 스페이스(손 모드)만, 나머지는 단추(사용자 결정).
// 빈 곳 끌기 = 여러 개 고르기(피그마식), 가운데 · 오른쪽 단추나 스페이스 + 끌기 = 화면 옮기기, 휠 = 커서 기준 확대.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Background, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type Connection, type Edge as FlowEdge, type EdgeChange, type FinalConnectionState, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  applyTemplate, autoLayout, LIMITS, NODE_SIZE, connect, renameStage, fromV1, connectProblem, disconnect, layers, putTech, removeStage, removeTech, toBoardView,
  addLink, removeLink, moveTechInStage, linkEnd, slotAt, stageHeight, techSlot, BOX,
  type Graph, type Pos, type TemplateKind,
} from "@/lib/blueprint/graph";
import { fromNames } from "@/lib/blueprint/board";
import { diffLines, graphDiff } from "@/lib/blueprint/graph-diff";
import { validateGraph, type Issue } from "@/lib/blueprint/validate";
import { toBoard } from "@/lib/blueprint/stored";
import { STUDIO_GATE, recommendAt } from "@/lib/blueprint/knowledge";
import { moveTechToStage, addStageAfter, addStageLinked, besideSpot, betweenSpot, insertBetween, CONNECT_KO, linkSaid, nameProblem, neighbors, parallelProblem, putProblem, putSaid, removeSaid, removedStageSaid, renamedSaid, sideSpot } from "@/lib/blueprint/panel-view";
import { STAGE_NAME_MAX } from "@/lib/blueprint/board";
import type { BlueprintPage, PoolTech } from "@/lib/server/blueprints";
import { ToastLine, useToast } from "../undo-toast";
import { markTech } from "../tech-map/actions";
import { pickedTechsAction } from "./actions";
import { loadPicked, removePicked, savePicked } from "@/lib/blueprint/picked";
import { cartChanged } from "@/lib/blueprint/cart-event";
import { AskDialog } from "../c-dialog";
import { InterviewDialog } from "./dialogs";
import { Dock } from "./dock";
import { LoadMenu } from "./load-menu";
import { GuideLines, useDragAssist } from "./drag-assist";
import { GhostStage, type Ghost } from "./ghost-stage";
import { Inspector } from "./inspector";
import { ListMode } from "./list-mode";
import { StageNode, type StageNodeType } from "./stage-node";
import { TechNode, type TechNodeType } from "./tech-node";
import { ResultDialog, type CheckTarget } from "./result-dialog";
import { SeqEdge, type SeqEdgeType } from "./seq-edge";
import type { PanelProps, Picked } from "./studio-types";
import { useStudioGraph } from "./use-studio-graph";
import { useConfirm } from "./use-studio-save";
import { useBounce } from "./use-bounce";
import "./studio.css";

const nodeTypes = { stage: StageNode, tech: TechNode };
/** 기술 노드 id = 관계선 끝 "기술id@단계id"(단계 id에는 @가 없다) */
const isTechNode = (id: string | null | undefined) => Boolean(id?.includes("@"));
const splitEnd = (end: string) => { const at = end.lastIndexOf("@"); return { techId: end.slice(0, at), stageId: end.slice(at + 1) }; };
const edgeTypes = { seq: SeqEdge };
const posOf = (g: Graph) => new Map(g.stages.map((s) => [s.id, { x: s.x, y: s.y }]));
/** 움직임 줄이기(P-12g B1): CSS의 --dur 0s는 카메라 이동(fitView) · 클래스 붙이기 같은 JS 움직임에 닿지 않아 따로 본다(지도 controller.ts와 같은 방식) */
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
/** 확정 선 긋기(B2) 한 번의 길이: studio.css se-draw(--dur × 2)보다 조금 길게 두고 클래스를 뗀다 */
const DRAW_MS = 600;
/** 화면 맞춤(P-12h-2 T1): 단계가 많아도 너무 작게 줄이지 않고(0.75 아래로 안 감) 끌어서 본다 */
// P-12j(11-22 사용자): 카드 폭 · 간격을 줄여 단계 6개가 1440에서 0.9배 이상. minZoom을 낮춰 판이 커도 전체를 담는다(첫 단계가 왼쪽 밖으로 나가지 않게)
const FIT = { padding: 0.03, minZoom: 0.4, maxZoom: 1.2 };
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
  const [selTechs, setSelTechs] = useState<Set<string>>(new Set()); // 고른 기술 노드(끝 id "기술@단계", H5 여러 개 고르기)
  // shortcut: 끄는 동안의 위치를 이 컴포넌트 상태에 둬서 포인터가 움직일 때마다 패널까지 다시 그린다. 단계가 수십 개를 넘어 끌기가 버벅이면 캔버스 자식으로 내리거나 패널을 memo한다
  const [drag, setDrag] = useState<Map<string, Pos> | null>(null);
  // 끄는 기술 노드(H2): 단계 기준 자리. 놓을 때 어느 단계 · 몇 번째인지 본다(ref = 같은 변경 묶음 안에서 바로 읽기)
  const [techDrag, setTechDrag] = useState<{ id: string; pos: Pos } | null>(null), techDragRef = useRef<{ id: string; pos: Pos } | null>(null);
  // B4 새 칩 한 번: 판에 기술 노드가 딱 하나 늘었을 때만 그 노드가 톡(불러오기 · 옮기기는 안 돎)
  const seenEnds = useRef<Set<string> | null>(null);
  useEffect(() => { if (graph) seenEnds.current = new Set(graph.stages.flatMap((s) => s.techs.map((t) => linkEnd(t.id, s.id)))); });
  const [dims, setDims] = useState<Map<string, { width: number; height: number }>>(new Map()); // 잰 노드 크기(미니맵이 씀)
  const [newName, setNewName] = useState(""), [adding, setAdding] = useState(false); // 위 막대 "＋ 단계"의 이름 칸(작은 팝오버, S3 전까지)
  const addBtn = useRef<HTMLButtonElement>(null), canvasBox = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null); // 옅은 새 단계 블록(S3: 선을 빈 곳에 놓음 · 위아래 +)
  const [hoverEdge, setHoverEdge] = useState<string | null>(null), edgeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bounce = useBounce();
  // H5 단축키(사용자 결정: 이 둘만): Ctrl/⌘+Z 되돌리기, Ctrl/⌘+Shift+Z 다시. 입력칸 · 글상자 · 고르기 칸 · 대화상자 안은 브라우저 기본 그대로
  const keys = useRef({ undo, redo, stop: bounce.stop });
  keys.current = { undo, redo, stop: bounce.stop };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "z") return;
      const t = e.target instanceof HTMLElement ? e.target : null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.closest("dialog, [role=dialog]"))) return;
      e.preventDefault(); keys.current.stop();
      if (e.shiftKey) keys.current.redo(); else keys.current.undo();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);
  // 서랍(P-12h-2 T1): 기본 닫힘, 기술 칩 · 카드를 고르면 열림. 열면 초점이 서랍으로, 닫으면 연 자리로(P-12j H1 고정 패널은 11-22 사용자 요청으로 되돌림)
  const [drawer, setDrawer] = useState(false), drawerFrom = useRef<HTMLElement | null>(null), drawerBox = useRef<HTMLElement>(null);
  // 열 때마다 n이 늘어 이미 열린 서랍도 초점을 옮김. at = 초점 갈 곳(카드를 눌러 연 것은 초점을 캔버스에 둠: Delete · 화살표가 그대로 되게)
  const [drawerAt, setDrawerAt] = useState<{ n: number; at: "insp" | "note" | "stay" }>({ n: 0, at: "insp" });
  useEffect(() => { if (drawer && drawerAt.at !== "stay") drawerBox.current?.querySelector<HTMLElement>(drawerAt.at === "note" ? "#insp-note" : ".insp")?.focus(); }, [drawer, drawerAt]);
  // 고른 카드가 서랍에 가리면 화면을 그만큼 옮긴다(U2, 움직임 줄이기면 바로)
  const pickedStage = picked?.stageId ?? null;
  useEffect(() => {
    if (!drawer || !pickedStage) return;
    const card = document.querySelector(`.react-flow__node[data-id="${CSS.escape(pickedStage)}"]`)?.getBoundingClientRect(), box = drawerBox.current?.getBoundingClientRect();
    const over = card && box ? card.right + 24 - box.left : 0;
    if (over <= 0) return;
    const vp = flow.getViewport();
    void flow.setViewport({ ...vp, x: vp.x - over }, { duration: calm() ? 0 : 200 });
  }, [drawer, pickedStage, flow]);
  const [editing, setEditing] = useState<string | null>(null); // 카드 위에서 이름 바꾸는 단계
  const now = useRef(graph); // 지우기 토스트의 되돌리기: 그 뒤에 판이 바뀌었는지 본다
  now.current = graph;
  const [loginAsk, setLoginAsk] = useState<string | null>(null); // 손님이 저장 · 판단을 누름: 무엇을 하려는지(묻는 대화상자 글)
  const [confirming, setConfirming] = useState(false), [asking, setAsking] = useState(false), [marking, setMarking] = useState<string | null>(null);
  const { toast, say, clear } = useToast();
  const assist = useDragAssist();
  // 손님 서랍 = 지도에서 담은 기술(P-12h-2 T3): 이 브라우저 목록 → 공개 칸만 읽는 액션. 끌어 놓을 수 있게 info에도 더한다
  const [pickedIds, setPickedIds] = useState<string[]>([]), [pickedTechs, setPickedTechs] = useState<PoolTech[] | null | undefined>(undefined);
  useEffect(() => {
    if (!guest) return;
    const ids = loadPicked();
    setPickedIds(ids);
    if (!ids.length) { setPickedTechs([]); return; }
    pickedTechsAction(ids).then(setPickedTechs, () => setPickedTechs(null));
  }, [guest]);
  const found = useMemo(() => pickedTechs ?? [], [pickedTechs]);
  const info = useMemo(() => new Map([...found, ...pool].map((t) => [t.id, t])), [pool, found]);
  const [log, setLog] = useState<string[]>([]); // 이 화면에서 판을 바꾼 일(알림 글)
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
    if (message) { say(message); setLog((l) => [...l.slice(-49), message]); } else clear();
  };
  const stageOf = (id: string) => g.stages.find((s) => s.id === id);
  /** 막힌 단추 한 벌(P-12h S4, page.css): aria-disabled + 누르면 이유 글. disabled와 달리 Tab으로 닿아 이유를 들을 수 있다 */
  const gate = (why: string | null, run: () => void) => ({ "aria-disabled": why ? true : undefined, title: why ?? undefined, onClick: () => (why ? say(why) : run()) });

  /** 손님 "목록에서 빼기": 이 브라우저 목록에서만 뺀다(판에 이미 넣은 칩은 그대로) */
  function unpickGuest(techId: string) {
    const next = removePicked(loadPicked(), techId);
    if (!savePicked(next)) return say("이 브라우저에 저장하지 못했어요. 목록은 그대로예요.");
    setPickedIds(next); setPickedTechs((x) => x?.filter((t) => t.id !== techId) ?? x); cartChanged(); // 메뉴 "청사진" 담은 수도 다시 셈(U1 배지)
    say("청사진에서 뺐어요. 지도에서 다시 담을 수 있어요.");
  }
  /** 손님이 저장 · 판단을 누르면: 판은 이 브라우저(손님 초안)에 그대로 두고 로그인으로. 로그인한 뒤 청사진에서 가져올지 묻는다 */
  const toLogin = (what: string) => setLoginAsk(what);
  /** 후보 칩의 "적용 후보로 고르기": 지도와 같은 판단 저장(markTech). 성공하면 서랍(관문 목록)을 다시 읽어 보통 칩이 된다 */
  async function markCandidate(techId: string, techName: string) {
    if (guest) return toLogin("청사진에 담으려면");
    if (inflight.current.has(techId) || settled.current.has(techId)) return; // 같은 기술을 겹쳐 보내지 않게(다른 기술을 고르는 사이 단추가 다시 켜져도)
    inflight.current.add(techId); setMarking(techId);
    const r = await markTech(techId, "candidate", "").catch(() => ({ ok: false as const, message: "저장하지 못했어요. 잠시 뒤 다시 시도해 주세요." }));
    inflight.current.delete(techId); setMarking((m) => (m === techId ? null : m));
    if (r.ok) { say(`${techName}을(를) 청사진에 담았어요.`); cartChanged(); settled.current.add(techId); setSettling({ id: techId, name: techName }); startRefresh(() => router.refresh()); } else say(r.message); // 실패면 점선 그대로(불변 4)
  }
  function dropTech(stageId: string, techId: string) {
    const t = info.get(techId), s = stageOf(stageId);
    if (!t || !s) return say(STUDIO_GATE);
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
    const r = gh.cut ? insertBetween(g, nm, gh.cut.from, gh.cut.to) : addStageLinked(g, nm, gh.at, gh);
    if ("problem" in r) return say(r.problem);
    const n = r.stage.name, want = gh.before.length + gh.after.length;
    apply(r.graph, want && !r.linked ? `"${n}" 단계를 더했지만 선은 잇지 못했어요(연결은 ${LIMITS.edges}개까지).`
      : gh.kind === "between" ? `${gh.of} 사이에 "${n}" 단계를 넣었어요.` : gh.kind === "after" ? `"${gh.of}" 다음에 "${n}" 단계를 더하고 이었어요.` : gh.kind === "before" ? `"${gh.of}" 앞에 "${n}" 단계를 더해 이었어요.` : `"${gh.of}"와(과) 같은 순서에 "${n}" 단계를 더했어요.`);
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
    if (sel.has(id) && sel.size + selTechs.size > 1) return onDelete({ nodes: [...sel, ...selTechs].map((x) => ({ id: x })), edges: [] }); // 여럿 고른 채 누름 = 함께
    const next = removeStage(g, id);
    canvasBox.current?.focus(); // 누른 단추가 카드와 함께 사라지므로
    if (picked?.stageId === id) unpick();
    setSel((x) => { const n = new Set(x); n.delete(id); return n; }); // 여럿 고른 채 지워도 사라진 단계가 남지 않게
    setSelTechs((x) => new Set([...x].filter((e) => splitEnd(e).stageId !== id))); // 그 단계 안 기술도
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
  const openDrawer = (at: "insp" | "note" | "stay" = "insp") => {
    if (!drawer) drawerFrom.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawer(true); setDrawerAt((x) => ({ n: x.n + 1, at }));
  };
  /** 선 사이에 단계 넣기(U2): 두 단계 가운데에 옅은 블록, 커밋하면 선을 바꿔 끼움 */
  function insertGhost(from: string, to: string) {
    const a = stageOf(from), b = stageOf(to), d = depthOf(to);
    if (!a || !b) return;
    openGhost({ at: betweenSpot(g, a, b), kind: "between", of: `"${a.name}" → "${b.name}"`, before: [from], after: [to], cut: { from, to } }, d);
  }
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

  const nodes: (StageNodeType | TechNodeType)[] = g.stages.map((s) => ({
    id: s.id, type: "stage", position: drag?.get(s.id) ?? bounce.at?.get(s.id) ?? { x: s.x, y: s.y }, selected: sel.has(s.id), measured: dims.get(s.id),
    style: { width: NODE_SIZE.w, height: stageHeight(s) }, // 컨테이너 크기 = graph.ts stageHeight(자동 정렬과 같은 값)
    data: { stage: s, order: lay?.ok ? lay.depth.get(s.id) ?? null : null, readOnly, onDropTech: dropTech, besideBlocked: readOnly ? null : parallelProblem(g, s.id), onBeside: readOnly ? undefined : besideGhost,
      edit: readOnly ? undefined : { onSide: sideGhost, onRemove: removeFromCard, hasIn: g.edges.some((e) => e.to === s.id), hasOut: g.edges.some((e) => e.from === s.id),
        onNote: (id) => { pick({ kind: "stage", stageId: id }); openDrawer("note"); },
        editing: editing === s.id, onEdit: setEditing, onRename: renameOnCard } },
  }));
  // 기술 노드(H2): 단계의 자식(parentId), 자리는 단계 안 자동 흐름(techSlot). 부모 다음에 와야 해서 단계 뒤에 붙인다
  const prevEnds = seenEnds.current, endsNow = g.stages.flatMap((s) => s.techs.map((t) => linkEnd(t.id, s.id)));
  const newEnds = prevEnds ? endsNow.filter((e) => !prevEnds.has(e)) : [];
  const popEnd = prevEnds && newEnds.length === 1 && endsNow.length === prevEnds.size + 1 ? newEnds[0] : null;
  for (const s of g.stages) s.techs.forEach((t, i) => {
    const id = linkEnd(t.id, s.id), moving = techDrag?.id === id;
    nodes.push({ id, type: "tech", parentId: s.id, position: moving ? techDrag.pos : techSlot(i), draggable: !readOnly, selectable: !readOnly, selected: selTechs.has(id), connectable: !readOnly,
      zIndex: moving ? 10 : undefined, style: { width: BOX.tech.w, height: BOX.tech.h },
      data: { tech: t, info: info.get(t.id), fresh: id === popEnd, readOnly, busy: busyId === t.id,
        picked: picked?.kind === "tech" && picked.stageId === s.id && picked.techId === t.id,
        onPick: () => { setPicked({ kind: "tech", stageId: s.id, techId: t.id }); openDrawer(); },
        onRemove: () => apply(removeTech(g, s.id, t.id), removeSaid(s.name, t.name)),
        onOpen: () => router.push(`/tech/${t.id}`), // 같은 탭(초안은 바뀔 때마다 이 브라우저에 저장돼 있음)
        onCandidate: info.has(t.id) ? undefined : () => void markCandidate(t.id, t.name) } });
  });
  const techName = (end: string) => { const { techId, stageId } = splitEnd(end); return stageOf(stageId)?.techs.find((t) => t.id === techId)?.name ?? ""; };
  /** 기술 노드를 놓음: 같은 단계면 순서 바꾸기, 다른 단계 상자 안이면 옮기기(관계선 끝도 따라감), 상자 밖이면 제자리. apply 한 번 = 되돌리기 한 칸 */
  function dropTechNode(id: string) {
    const d = techDragRef.current;
    techDragRef.current = null; setTechDrag(null);
    if (!d || d.id !== id) return;
    const { techId, stageId: fromId } = splitEnd(id), from = stageOf(fromId), tech = from?.techs.find((t) => t.id === techId);
    if (!from || !tech) return;
    const cx = from.x + d.pos.x + BOX.tech.w / 2, cy = from.y + d.pos.y + BOX.tech.h / 2;
    const to = g.stages.find((s) => cx >= s.x && cx <= s.x + NODE_SIZE.w && cy >= s.y && cy <= s.y + stageHeight(s));
    if (!to) return say("단계 상자 안에 놓아 주세요. 제자리로 돌렸어요.");
    const top = cy - to.y - BOX.tech.h / 2;
    if (to.id === fromId) {
      const next = moveTechInStage(g, fromId, techId, slotAt(top, from.techs.length - 1));
      if (next !== g) apply(next, `"${from.name}"에서 ${tech.name}의 순서를 바꿨어요.`);
      return;
    }
    const r = moveTechToStage(g, fromId, to.id, { id: techId, grade: info.get(techId)?.grade ?? "unknown" }, slotAt(top, to.techs.length));
    if (!r.ok) return say(r.message);
    apply(r.graph, `${tech.name}을(를) "${from.name}"에서 "${to.name}"(으)로 옮겼어요.`);
  }
  // 선 위에 마우스: 가운데 "끊기". 선에서 단추로 옮기는 틈(150ms)에는 지킨다
  const leaveEdge = () => { clearTimeout(edgeTimer.current); edgeTimer.current = setTimeout(() => setHoverEdge(null), 150); };
  const keepEdge = (id: string) => { clearTimeout(edgeTimer.current); setHoverEdge(id); };
  const edges: (FlowEdge | SeqEdgeType)[] = g.edges.map((e) => {
    const id = `${e.from}>${e.to}`, on = selEdges.has(id) || sel.has(e.from) || sel.has(e.to);
    return { id, type: "seq", source: e.from, target: e.to, selected: selEdges.has(id), className: `${on ? "se se-on" : "se"}${drawing ? " se-draw" : ""}`, markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: "var(--on-paper)" },
      data: { label: `${stageOf(e.from)?.name ?? ""} → ${stageOf(e.to)?.name ?? ""}`, hover: hoverEdge === id, onKeep: () => keepEdge(id), onLeave: leaveEdge,
        // 속성 패널 "끊기"와 같게: 고른 단계는 그대로, 사라지는 단추 대신 캔버스로 초점
        onInsert: readOnly ? undefined : () => { setHoverEdge(null); insertGhost(e.from, e.to); },
        onCut: readOnly ? undefined : () => { canvasBox.current?.focus(); setHoverEdge(null); setSelEdges((x) => { const n = new Set(x); n.delete(id); return n; });
          apply(disconnect(g, e.from, e.to), linkSaid(g, e.from, e.to, true)); } } };
  });
  // 기술 관계선(H2): 사용자가 그은 표시(가는 점선, "검증 · 호환"이 아님). 끊기는 순서 선과 같은 단추
  for (const l of g.links ?? []) {
    const id = `L:${l.from}>${l.to}`, label = `${techName(l.from)} → ${techName(l.to)}`;
    edges.push({ id, type: "seq", source: l.from, target: l.to, selected: selEdges.has(id), className: "tl", markerEnd: { type: MarkerType.ArrowClosed, width: 8, height: 8 },
      data: { label, hover: hoverEdge === id, onKeep: () => keepEdge(id), onLeave: leaveEdge,
        onCut: readOnly ? undefined : () => { canvasBox.current?.focus(); setHoverEdge(null); setSelEdges((x) => { const n = new Set(x); n.delete(id); return n; });
          apply(removeLink(g, l.from, l.to), `"${label}" 관계 표시를 지웠어요.`); } } });
  }
  const near = assist.near;
  if (near) edges.push({ id: "near", source: near.from, target: near.to, selectable: false, focusable: false, deletable: false, className: near.blocked ? "se se-blocked" : "se se-near",
    label: near.blocked === "cycle" ? "고리가 생겨 못 이어요" : near.blocked ? "못 이어요" : "놓으면 이어져요",
    labelStyle: { fontSize: 11, fill: near.blocked ? "var(--ink-danger)" : "var(--ink-2)" } });

  function onNodesChange(all: NodeChange<StageNodeType | TechNodeType>[]) {
    const changes: NodeChange<StageNodeType>[] = [];
    // 여러 개를 함께 끌면 단계만 옮긴다(기술은 상자 안 자리 규칙이라 각자, H5): 한 묶음에 위치 변경이 둘 이상이면 기술 끌기는 버림
    const group = all.filter((c) => c.type === "position").length > 1;
    let nextTechSel: Set<string> | null = null;
    for (const c of all) {
      if (!("id" in c) || !isTechNode(c.id)) { changes.push(c as NodeChange<StageNodeType>); continue; }
      if (c.type === "select") { nextTechSel ??= new Set(selTechs); if (c.selected) nextTechSel.add(c.id); else nextTechSel.delete(c.id); continue; }
      if (c.type !== "position" || group) continue; // 크기는 고정
      if (c.position) { techDragRef.current = { id: c.id, pos: c.position }; setTechDrag(techDragRef.current); }
      if (c.dragging === false) dropTechNode(c.id);
    }
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
    if (nextSel || nextTechSel) {
      const ss = nextSel ?? sel, ts = nextTechSel ?? selTechs;
      if (nextSel) setSel(ss);
      if (nextTechSel) setSelTechs(ts);
      const total = ss.size + ts.size, tech = ts.size === 1 && !ss.size ? splitEnd([...ts][0]) : null, one = ss.size === 1 && !ts.size ? [...ss][0] : null;
      setPicked((p) => (one ? (p?.stageId === one ? p : { kind: "stage", stageId: one }) : tech ? { kind: "tech", stageId: tech.stageId, techId: tech.techId } : null));
      if (total && !readOnly) openDrawer("stay"); // U2(11-22 사용자): 카드를 고르면 서랍이 열림(초점은 캔버스에 남음). 여럿이면 "n개 골랐어요"
    }
    if (ended) { const r = assist.drop(g, moved); apply(r.next, r.linked ? "가까이 둔 단계와 이었어요." : undefined); setDrag(null); } else if (moved !== drag) setDrag(moved);
  }
  function onEdgesChange(changes: EdgeChange[]) {
    let next: Set<string> | null = null;
    for (const c of changes) if (c.type === "select") { next ??= new Set(selEdges); if (c.selected) next.add(c.id); else next.delete(c.id); }
    if (next) setSelEdges(next);
  }
  const MIXED = "기술은 기술끼리(관계 표시), 단계는 단계끼리(순서) 이어요.";
  const onConnect = (c: Connection) => {
    if (isTechNode(c.source) || isTechNode(c.target)) {
      if (!isTechNode(c.source) || !isTechNode(c.target)) return say(MIXED);
      const next = addLink(g, c.source, c.target);
      if (next === g) return say((g.links?.length ?? 0) >= LIMITS.links ? `관계 표시는 ${LIMITS.links}개까지예요.` : "이미 그은 관계이거나 같은 기술이에요.");
      return apply(next, `"${techName(c.source)}" → "${techName(c.target)}" 관계를 표시했어요(내가 그은 표시예요).`);
    }
    const p = connectProblem(g, c.source, c.target); if (p) say(CONNECT_KO[p]); else apply(connect(g, c.source, c.target), linkSaid(g, c.source, c.target, false));
  };
  /** 빈 곳에 놓았으면(S3) 그 자리에 옅은 새 단계: 오른쪽 점에서 끌면 다음 단계, 왼쪽 점에서 끌면 앞 단계.
   *  못 잇는 곳에 놓았으면(isValidConnection이 막아 onConnect가 안 불림) 이유를 알린다. 들어오는 점에서 끌었으면 방향을 뒤집어 본다 */
  const onConnectEnd = (ev: MouseEvent | TouchEvent, st: FinalConnectionState) => {
    if (st.fromNode && isTechNode(st.fromNode.id)) { if (st.isValid === false) say(MIXED); return; } // 기술 점은 빈 곳에 놓아도 새 단계를 만들지 않는다
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
    if (isTechNode(st.toNode.id)) return say(MIXED);
    const [from, to] = st.fromHandle?.type === "target" ? [st.toNode.id, st.fromNode.id] : [st.fromNode.id, st.toNode.id];
    const p = connectProblem(g, from, to);
    if (p) say(CONNECT_KO[p]);
  };
  /** 지우기(Delete · 카드 아래 삭제 · 서랍 "n개 지우기"): 선 · 기술 · 단계를 apply 한 번에(되돌리기 한 칸). 노드를 지웠으면 토스트에도 되돌리기 */
  function onDelete({ nodes: ns, edges: es }: { nodes: { id: string }[]; edges: { id: string; source: string; target: string }[] }) {
    let next = g;
    for (const e of es) next = e.id.startsWith("L:") ? removeLink(next, e.source, e.target) : disconnect(next, e.source, e.target);
    const tns = ns.filter((x) => isTechNode(x.id)), sns = ns.filter((x) => !isTechNode(x.id));
    for (const n of tns) { const t = splitEnd(n.id); next = removeTech(next, t.stageId, t.techId); }
    for (const n of sns) next = removeStage(next, n.id);
    setSel(new Set()); setSelEdges(new Set()); setSelTechs(new Set()); setPicked(null);
    if (!ns.length) return apply(next, es.length === 1 ? linkSaid(g, es[0].source, es[0].target, true) : `연결 ${es.length}개를 끊었어요.`);
    canvasBox.current?.focus(); // 누른 단추 · 고른 노드가 사라지므로
    const msg = `${[sns.length ? `단계 ${sns.length}개` : "", tns.length ? `기술 ${tns.length}개` : ""].filter(Boolean).join(" · ")}를 지웠어요.`;
    apply(next, msg);
    say(msg, () => { if (now.current === next) { bounce.stop(); undo(); say("지운 것을 살렸어요."); } else say("그 뒤에 판이 바뀌어 여기서는 되돌릴 수 없어요. 위 \"되돌리기\"를 써 주세요."); });
  }
  /** 질문 6개의 답으로 만든 틀(11-21 사용자 결정, 하단 패널 불러오기 탭에서 엶). 지금 판이 있으면 대화상자 마지막에 "바꾸기"로 묻고, 되돌리기 한 칸이면 전 판 */
  function makeFromAnswers(cols: string[][]) {
    setAsking(false); unpick(); setTemplateId(null);
    apply(fromV1(fromNames(cols)), "질문 답으로 틀을 만들었어요. 되돌리기를 누르면 전 판으로 돌아가요.");
  }
  const unpick = () => { setSel(new Set()); setSelEdges(new Set()); setSelTechs(new Set()); setPicked(null); setDrawer(false); }; // 빈 곳 누르기 · Esc = 서랍도 닫힘(U2)
  /** 지우기 키: 캔버스 안에 초점이 있을 때만(React Flow의 deleteKeyCode는 문서 전체에서 들어 패널 · 확정 창에서도 지워짐). Mac의 delete = Backspace */
  function onCanvasKey(e: React.KeyboardEvent) {
    // 카드에 초점이 있을 때 F2 · Enter = 카드 위 이름 바꾸기(React Flow는 Enter로 고르기도 한다)
    const node = e.target instanceof HTMLElement && e.target.classList.contains("react-flow__node") ? e.target.dataset.id : undefined;
    if (!readOnly && node && (e.key === "F2" || e.key === "Enter")) { e.preventDefault(); setEditing(node); return; }
    if (readOnly || (e.key !== "Delete" && e.key !== "Backspace") || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (!sel.size && !selEdges.size && !selTechs.size) return;
    e.preventDefault();
    onDelete({ nodes: [...sel, ...selTechs].map((id) => ({ id })), edges: edges.filter((x) => selEdges.has(x.id)) });
  }
  // 검증(P-12j H4): 확정 창 "고칠 것" · "알아 둘 것". 관문 밖 기술은 막고(DB도 거절, 손님은 관문이 없어 안 막음), 위험 · 수집 오류 · 빈 단계는 알리기만
  const issues = validateGraph(g, info, { guest });
  const problems = issues.filter((i) => i.blocks).map((i) => i.message), notices = issues.filter((i) => !i.blocks).map((i) => i.message);
  /** 변경 이력 이름을 누름: 그 단계 · 기술을 고르고, 화면을 그쪽으로, 서랍을 연다. 초점은 서랍으로(키보드) */
  function goTo(t: Issue["target"]) {
    if (!t || !stageOf(t.stageId)) return;
    setPicked(t.techId ? { kind: "tech", stageId: t.stageId, techId: t.techId } : { kind: "stage", stageId: t.stageId }); setSel(new Set([t.stageId]));
    if (!listMode) void flow.fitView({ nodes: [{ id: t.stageId }], padding: 0.6, maxZoom: 1.1, duration: calm() ? 0 : 200 });
    openDrawer();
  }
  // AI 점검할 확정본: 이 화면에서 방금 확정한 것, 없으면 최근 확정 이력(새로 고쳐도 "먼저 확정해 주세요"로 막히지 않게, P-12h S1)
  // 새로 고친 뒤에는 이 판의 확정 id를 모르므로(확정 id는 이 화면에서만 기억) 최근 확정본이 지금 판과 같은 내용인지(단계 순서 · 이름 · 기술)를 보고 알린다
  const latest = history?.[0];
  const sameAsBoard = (h: NonNullable<typeof latest>) => board !== null && JSON.stringify(h.board.map((c) => c.map((s) => [s.name, s.techs.map((t) => t.id)])))
    === JSON.stringify(board.map((c) => c.map((s) => [s.name, s.techs.map((t) => t.id)])));
  // 지난 확정과 달라진 것(T4): 최근 확정본(graph가 있으면 graph, 옛 확정본은 board → 판)과 지금 판. 창이 열려 있을 때만 센다
  const changes = !confirming ? null : history === null ? "unknown" as const : latest ? diffLines(graphDiff(latest.graph ?? fromV1(toBoard(latest.board)), g)) : null;
  const checkTarget: CheckTarget = confirmedId ? { id: confirmedId, label: "방금 확정한 것" }
    : history === null ? "unknown"
    : latest ? { id: latest.id, label: `최근 확정 "${latest.name}" (${new Date(latest.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })})${sameAsBoard(latest) ? " — 지금 판과 같아요" : " — 지금 판과 달라요. 지금 판을 점검하려면 먼저 확정해 주세요"}` } : null;
  /** 패널에서 고르면 캔버스에서도 그 단계를 고른 모양으로 */
  function pick(p: Picked) { setPicked(p); setSel(p ? new Set([p.stageId]) : new Set()); if (p?.kind === "tech") openDrawer(); } // 기술을 고르면 서랍이 열려 초점도 그리로(카드 고르기는 onNodesChange에서 열고 초점은 그대로)
  // 여럿 고른 것 중 지금 판에 있는 것만(되돌리기 · 다른 곳에서 지운 뒤 남은 id로 수가 부풀지 않게)
  const chosen = [...[...sel].filter((id) => stageOf(id)), ...[...selTechs].filter((e) => endsNow.includes(e))];
  const panel: PanelProps = { graph: g, picked, onPick: pick, onAsk: () => setAsking(true), projects, apply, pool, tags, onTags: (id, t) => setTags((x) => (x ? { ...x, [id]: t } : x)), history, say,
    onCandidate: (tid, tn) => void markCandidate(tid, tn), marking: busyId,
    guest, guestPicks: guest ? { ids: pickedIds, techs: pickedTechs, remove: unpickGuest } : undefined, onInsert: listMode || readOnly ? undefined : insertGhost, log, multi: chosen.length > 1 ? { count: chosen.length, remove: () => onDelete({ nodes: chosen.map((id) => ({ id })), edges: [] }) } : undefined };

  return (
    <div className="studio" onKeyDown={(e) => { if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) unpick(); }}>
      <div className="studio-bar">
        <label className="sr-only" htmlFor="bp-name">청사진 이름</label>
        <input id="bp-name" className="bp-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn" {...gate(canUndo ? null : "되돌릴 것이 없어요.", () => { bounce.stop(); undo(); })} title="되돌리기 (Ctrl/⌘+Z)">되돌리기</button>
        <button type="button" className="btn" {...gate(canRedo ? null : "다시 할 것이 없어요.", () => { bounce.stop(); redo(); })} title="다시 (Ctrl/⌘+Shift+Z)">다시</button>
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
        <LoadMenu {...panel} blocked={readOnly ? READ_ONLY : null} />
        <button type="button" className="btn" {...gate(listMode ? NO_CANVAS : readOnly ? READ_ONLY : null, arrange)}>자동 정렬</button>
        <button type="button" className="btn" {...gate(listMode ? NO_CANVAS : null, () => void flow.fitView({ ...FIT, duration: calm() ? 0 : 200 }))}>보기 초기화</button>
        {narrow ? <button type="button" className="btn" aria-pressed={phoneView} onClick={() => setPhoneView(!phoneView)}>그림으로 보기</button>
          : null}{/* 넓은 화면의 목록 편집 켜기는 하단 패널 탭 줄 끝 작은 링크로(11-22 사용자: 기능은 두고 단추만 내리기) */}
        <span className="studio-grow" />
        <button type="button" className="btn btn-primary" onClick={() => { done.reset(); setConfirming(true); }}>확정 · 내보내기</button>
      </div>
      {unread ? <p className="notice studio-note" role="status">{unread.kept ? "지난 초안을 읽지 못해 새 판으로 열었어요. 지난 초안은 지우지 않고 이 브라우저에 따로 보관했어요."
        : "지난 초안을 읽지 못해 새 판으로 열었어요. 따로 보관할 자리가 없어 지난 초안을 그대로 두었어요. 이 판을 고치기 시작하면 그 위에 저장돼요."}</p> : null}
      {guest ? <p className="notice studio-note" role="status">로그인 전이에요. 판은 이 브라우저에만 남고, 기술은 지도에서 &quot;청사진에 담기&quot;로 고른 것을 아래 기술 탭에서 넣어요. 내보내기 복사는 그대로 되고, 확정 · 템플릿 · AI 점검은 <a href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a>하면 돼요.</p> : null}
      {guestDraft ? <p className="notice studio-note" role="status">로그인 전에 이 브라우저에서 만들던 판 &quot;{guestDraft.name}&quot;이 있어요. 가져올까요? 지금 판은 되돌리기로 돌아와요.{" "}
        <button type="button" className="btn" onClick={() => answerGuest(true)}>가져오기</button> <button type="button" className="btn" onClick={() => answerGuest(false)}>버리기</button></p> : null}
      <div className="studio-main" data-list={listMode ? "" : undefined}>
        {listMode ? <div className="studio-list"><ListMode {...panel} /></div> : (
          <div ref={canvasBox} className="studio-canvas" role="region" tabIndex={-1} onKeyDown={onCanvasKey} aria-label="청사진 캔버스. 단계를 끌어 옮기고, 오른쪽 점에서 다른 단계의 왼쪽 점으로 끌어 순서를 이어요. 빈 곳에 놓으면 새 단계가 생겨요. 기술은 끌어 순서를 바꾸거나 다른 단계로 옮기고, 기술의 점끼리 이으면 관계 표시가 돼요. 키보드 · 화면 읽기는 하단 패널의 '키보드로 편집'을 쓰세요">
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onEdgeMouseEnter={readOnly ? undefined : (_, e) => keepEdge(e.id)} onEdgeMouseLeave={readOnly ? undefined : leaveEdge}
              onConnect={readOnly ? undefined : onConnect} onConnectEnd={readOnly ? undefined : onConnectEnd} isValidConnection={(c) => !readOnly && (isTechNode(c.source) || isTechNode(c.target) ? isTechNode(c.source) && isTechNode(c.target) && c.source !== c.target : connectProblem(g, c.source, c.target) === null)}
              onDelete={onDelete} onPaneClick={() => { setGhost(null); unpick(); }} deleteKeyCode={null} multiSelectionKeyCode="Shift" selectionOnDrag={!readOnly} panOnDrag={readOnly ? true : [1, 2]} panActivationKeyCode="Space"
              nodesDraggable={!readOnly} nodesConnectable={!readOnly} elementsSelectable={!readOnly} edgesFocusable={false}
              nodeDragThreshold={4} minZoom={0.3} maxZoom={2} fitView fitViewOptions={FIT} zoomOnDoubleClick={false} proOptions={{ hideAttribution: true }}>
              {/* P-12m: 도면 격자(확대 · 이동을 따라감) */}
              <Background gap={24} size={1.5} color="var(--grid-2)" />
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
      <Dock {...panel} listEdit={narrow ? undefined : { on: listOn, flip: () => setListOn(!listOn) }} go={goTo} />
      <ToastLine toast={toast} clear={clear} className="c-toast-float" />
      {asking ? <InterviewDialog replacing={g.stages.length > 0} onClose={() => setAsking(false)} onMake={(cols) => makeFromAnswers(cols)} /> : null}
      {confirming ? <ResultDialog name={name.trim() || "이름 없는 청사진"} board={board} graph={g} changes={changes} problems={problems} notices={notices} projects={projects} busy={done.busy} error={done.error} guest={guest}
        check={checkTarget} say={say} onLogin={() => { setConfirming(false); toLogin("확정하려면"); }}
        onConfirm={(p) => void done.confirm(name.trim() || "이름 없는 청사진", p, g, templateId)} onClose={() => setConfirming(false)} /> : null}
      {loginAsk ? <AskDialog title="로그인할까요?" yes="로그인하러 가기" onYes={() => { setLoginAsk(null); router.push(`/login?next=${encodeURIComponent("/blueprint")}`); }} onClose={() => setLoginAsk(null)}>
        <p>{loginAsk} 로그인이 필요해요. 지금 판은 이 브라우저에 그대로 두고, 로그인한 뒤 가져올 수 있어요.</p>
      </AskDialog> : null}
    </div>
  );
}
