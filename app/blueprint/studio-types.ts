// 청사진 스튜디오(P-12e) 화면 조각끼리 주고받는 모양. 캔버스(studio · stage-node · tech-chip · stepper)와
// 패널(dock · inspector · list-mode)이 같은 그래프 상태를 본다. 그래프를 바꾸는 길은 apply 하나(되돌리기 · 저장을 studio가 한 곳에서).
import type { Graph } from "@/lib/blueprint/graph";
import type { BlueprintRecord } from "@/lib/blueprint/stored";
import type { PoolTech } from "@/lib/server/blueprints";
import type { Say } from "../undo-toast";

/** ① 단계 구축 → ② 스킬 붙이기 → ③ 결과물 */
export type Step = 1 | 2 | 3;
/** 고른 것: 단계 하나 또는 단계 안의 기술 하나 */
export type Picked = { kind: "stage"; stageId: string } | { kind: "tech"; stageId: string; techId: string } | null;
/** graph.ts 편집 함수의 결과를 넘긴다. 같은 그래프(===)면 아무 일도 없다. say가 있으면 알림 */
export type Apply = (next: Graph, say?: string) => void;

export type PanelProps = {
  graph: Graph; step: Step; picked: Picked; onPick: (p: Picked) => void; apply: Apply;
  /** 서랍 후보(내 기술 · 적용 후보 · 이력) */ pool: PoolTech[];
  /** 내 태그(기술 id → 태그). null = 읽지 못함 */ tags: Record<string, string[]> | null;
  onTags: (techId: string, tags: string[]) => void;
  history: BlueprintRecord[] | null; say: Say;
  /** 이 화면에서 방금 확정한 청사진 id(AI 점검 탭이 씀). 아직 확정 안 했으면 null */ confirmedId: string | null;
};

/** 하단 패널 기술을 캔버스 단계로 끌 때 dataTransfer에 techId를 싣는 형식 */
export const TECH_DRAG = "application/x-techradar-tech";
