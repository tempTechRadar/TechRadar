// 흐름 그림의 상태별 모양(색·선·글자). 그림(app/admin/flow/flow-diagram.tsx)과 대비 시험(lib/a11y/contrast.test.ts)이 같은 값을 쓴다.
// 색만으로 상태를 말하지 않게 상자마다 label 글자를 함께 쓴다(PRD-NF5).
import type { NodeState } from "./status.ts";

export const LOOK: Record<NodeState, { fill: string; stroke: string; label: string; dash?: string }> = {
  off: { fill: "#eceae4", stroke: "#b9b4a8", label: "안 켜짐" },
  running: { fill: "#bddcf7", stroke: "#2f7fc4", label: "실행 중" },
  ok: { fill: "#bfe8cf", stroke: "#2e9a5f", label: "성공" },
  bad: { fill: "#f7c6c1", stroke: "#d6453b", label: "실패" },
  wait: { fill: "#fff1d6", stroke: "#e08a00", label: "판단 대기", dash: "6 4" },
  disabled: { fill: "#f6f5f1", stroke: "#cfcabe", label: "꺼 둠(3순위)", dash: "3 4" },
};

/** 그림 안 글자·바탕 색 */
export const FLOW_INK = { name: "#2c2a26", state: "#5b564c", badgeBg: "#2c2a26", canvas: "#fbfaf7", focus: "#1f4fbf" };
