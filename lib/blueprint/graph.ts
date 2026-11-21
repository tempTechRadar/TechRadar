// 청사진 그래프 v2(P-12e): 자유 캔버스의 단계(노드) + 연결선(순서). DB · 화면(xyflow) · 서버를 모르는 순수 함수만 둔다.
// 순서는 연결선이 정한다: 깊이 = 들어오는 선이 없는 단계에서 가장 긴 경로(0부터), 깊이가 같으면 동시. 위치(x, y)는 순서와 무관.
// 저장 모양: { v: 2, stages: [{ id, name, x, y, techs: [{ id, name }] }], edges: [{ from, to }] } — blueprints.graph 칸(M1).
// 기존 board 칸은 지우지 않고 toBoardView로 투영해 둔다 → 이력 · usageOf · exportText · parseBoard는 그대로 쓴다.
// 모든 바꾸기는 새 그래프를 돌려준다(되돌리기 = 전 그래프를 그대로 다시 쓰기). 못 바꾸면 같은 그래프(===)를 돌려준다.
//
// 이 파일의 함수 목록(다음 커밋에서 채움 — 이름 · 서명은 이 머리말이 약속):
//   읽기
//     layers(g): Layers                                   깊이 계산(사이클이면 고리를 돌려줌)
//     toBoardView(g): Board | null                        깊이마다 열 하나, 같은 깊이는 y → x → id 순. 사이클이면 null
//     limitProblems(g): string[]                          확정 조건 어긋남(깊이 · 같은 깊이 · 단계 · 기술 · 연결 · 고리). 빈 배열이면 확정 가능
//     wouldCycle(g, from, to): boolean                    from → to를 이으면 고리가 생기는가(자기 자신 포함)
//     connectProblem(g, from, to): ConnectProblem | null  이을 수 없는 이유(null이면 이을 수 있음)
//     nearestLink(g, id, reach?, sizeOf?): Link | null    끄는 단계 가까이의 "붙을 자리"(이미 이어진 짝은 건너뜀, blocked면 빨간 점선)
//     snap(rect, others, reach?): Snapped                 8px 격자 + 다른 단계와 왼쪽 · 가운데 · 오른쪽(위 · 가운데 · 아래) 정렬 보조선
//   바꾸기
//     createStage(name, x, y, techs?): Stage              새 단계(id 새로)
//     addStage(g, stage): Graph                           단계 더하기(48개 · 이름 1~20자)
//     removeStage(g, id): Graph                           단계와 그 연결선 지움
//     renameStage(g, id, name): Graph
//     moveStages(g, to: Map<id, Pos>): Graph              절대 위치로(여러 개 끌기도 한 번에)
//     connect(g, from, to): Graph                         connectProblem이 null일 때만
//     disconnect(g, from, to): Graph
//     putTech(g, stageId, tech): Graph                    같은 기술은 한 번, 단계마다 8개까지(위험 등급 막기는 서버 · 서랍)
//     removeTech(g, stageId, techId): Graph
//     autoLayout(g): Graph                                깊이마다 열, 같은 깊이는 지금 y 순서 유지, 열은 가운데 맞춤(사이클이면 그대로)
//   바꿔 읽기
//     fromV1(board): Graph                                옛 열 · 행 판 → 그래프(이웃한 열의 모든 짝을 잇는다)
//     parseGraph(raw): ParsedGraph                        화면 · DB에서 온 값 검사(경계). 기술 name은 믿지 않음(서버가 DB에서 다시 읽음)
//     asFrame(g): Graph                                   틀: 단계와 연결만(기술 뺌)
//     applyTemplate(t, kind): Graph                       틀 · 조합 적용(단계 id를 새로 매김)
//   한도는 확정 조건이라 편집 중에는 막지 않는다(깊이 · 같은 깊이는 limitProblems가 알림). 편집 함수가 막는 것은 단계 48 · 기술 8 · 연결 200 · 고리 · 자기 연결 · 겹친 연결.
import type { BlueprintTech, Stage as BoardStage } from "./board.ts";

export type { BlueprintTech };
export type Pos = { x: number; y: number };
export type Size = { w: number; h: number };
export type Rect = Pos & Size;
/** 판의 단계(id · 이름 · 기술)에 캔버스 위치를 더한 것. x · y는 화면 좌표(px, 정수) */
export type Stage = BoardStage & Pos;
/** from → to: from이 끝나야 to를 시작한다 */
export type Edge = { from: string; to: string };
export type Graph = { v: 2; stages: Stage[]; edges: Edge[] };

/** 확정 조건(서버 · DB 함수 blueprint_graph_clean과 같은 값). 단계 이름 1~20자 · id 1~64자는 parseGraph가 본다 */
export const LIMITS = { depth: 12, parallel: 4, stages: 48, techs: 8, edges: 200 } as const;
export const STAGE_ID_MAX = 64;
/** 화면 좌표 한도(이 밖은 잘못 온 값) */
export const COORD_MAX = 100000;

/** 깊이 계산 결과: levels[d] = 깊이 d의 단계 id(y → x → id 순). 사이클이면 cycle = 고리를 이루는 단계 id(연결 방향 순서) */
export type Layers = { ok: true; depth: Map<string, number>; levels: string[][] } | { ok: false; cycle: string[] };
export type ConnectProblem = "self" | "missing" | "exists" | "cycle" | "limit";
export type Link = { from: string; to: string; blocked: ConnectProblem | null };
export type Guide = { axis: "x" | "y"; at: number };
export type Snapped = Pos & { guides: Guide[] };
export type ParsedGraph = { ok: true; graph: Graph } | { ok: false; message: string };
export type TemplateKind = "frame" | "combo";

export const emptyGraph = (): Graph => ({ v: 2, stages: [], edges: [] });
