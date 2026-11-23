// 청사진 스튜디오(P-12e) 화면 조각끼리 주고받는 모양. 캔버스(studio · stage-node · tech-chip · stepper)와
// 패널(dock · inspector · list-mode)이 같은 그래프 상태를 본다. 그래프를 바꾸는 길은 apply 하나(되돌리기 · 저장을 studio가 한 곳에서).
import type { Graph } from "@/lib/blueprint/graph";
import type { BlueprintRecord } from "@/lib/blueprint/stored";
import type { PoolTech } from "@/lib/server/blueprints";
import type { Say } from "../undo-toast";

/** 고른 것: 단계 하나 또는 단계 안의 기술 하나 */
export type Picked = { kind: "stage"; stageId: string } | { kind: "tech"; stageId: string; techId: string } | null;
/** graph.ts 편집 함수의 결과를 넘긴다. 같은 그래프(===)면 아무 일도 없다. say가 있으면 알림 */
/** name = 판과 함께 이름도 바꾼 일(이력 불러오기 등): 이름도 되돌리기 칸에 들어가고 시작한 템플릿 표시가 지워진다 */
/** merge = 되돌리기 칸을 새로 만들지 않고 지금 칸을 바꿈(메모 입력 중) */
export type Apply = (next: Graph, say?: string, name?: string, merge?: boolean) => void;

export type PanelProps = {
  graph: Graph; picked: Picked;
  /** "질문으로 틀 만들기" 창 열기(하단 패널 불러오기 탭, P-12h S1) */ onAsk: () => void;
  /** 내 프로젝트(기술 트리 "프로젝트" 분류기준의 폴더 이름, P-12h S2) */ projects: { id: string; name: string }[]; onPick: (p: Picked) => void; apply: Apply;
  /** 서랍 후보(내 기술 · 적용 후보 · 이력) */ pool: PoolTech[];
  /** 서랍 "지도 전체"(P-12o, 공개 칸만, null = 못 읽음) · 그 기술을 단계에 넣기(로그인은 먼저 담기, 손님은 이 브라우저 담기) */ catalog: PoolTech[] | null; onPlace: (stageId: string, techId: string) => void;
  /** 내 태그(기술 id → 태그). null = 읽지 못함 */ tags: Record<string, string[]> | null;
  onTags: (techId: string, tags: string[]) => void;
  history: BlueprintRecord[] | null; say: Say;
  /** 관문 밖 기술을 적용 후보로 고르기(markTech) · 지금 고르는 중인 기술 id */ onCandidate: (techId: string, name: string) => void; marking: string | null;
  /** 로그인 전(P-12f 손님): 이력 · 템플릿 · AI 점검은 로그인 안내 */ guest?: boolean;
  /** 손님 서랍 = 지도에서 담은 기술(P-12h-2 T3, 이 브라우저 목록). techs undefined = 읽는 중, null = 못 읽음. ids = 담은 수(공개 목록에서 빠진 것 세기) */
  guestPicks?: { ids: string[]; techs: PoolTech[] | null | undefined; remove: (techId: string) => void };
  /** 같은 순서에 단계 더하기(P-12o: 카드 위 · 아래 +를 대신): 옅은 블록을 연다. 캔버스가 없으면(목록 모드는 자기 단추) 없음 */ onBeside?: (stageId: string) => void;
  /** 선 사이에 단계 넣기(U2, 캔버스 선 위 +의 키보드 짝): 옅은 블록을 연다. 캔버스가 없으면(목록 모드) 없음 */ onInsert?: (from: string, to: string) => void;
  /** 이 화면에서 판을 바꾼 일(되돌리기 칸의 알림 글, 되돌린 것 포함 · 최근 50개). Inspector 이력 탭 · H4 변경 이력 */ log?: string[];
  /** 캔버스에서 여럿 고름(H5): 서랍은 "n개 골랐어요"와 함께 지우기만 */ multi?: { count: number; remove: () => void };
};

/** 하단 패널 기술을 캔버스 단계로 끌 때 dataTransfer에 techId를 싣는 형식 */
export const TECH_DRAG = "application/x-techradar-tech";
