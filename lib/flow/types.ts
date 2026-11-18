// flow/flow.json의 모양(읽기 전용, 주인: 차세일). docs/flow.md 2절의 상자·화살표.
export type FlowNodeType = "start" | "api" | "transform" | "branch" | "human" | "db";

export type FlowNode = {
  id: string;
  type: FlowNodeType;
  name: string;
  badge?: string;
  priority?: number;
  enabled?: boolean;
  /** 시작 상자만: runs.trigger 값과 같다 */
  run_trigger?: string;
};

export type FlowEdge = { from: string; to: string; when: string };
export type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };

// runs·run_steps에서 칠하는 데 쓰는 칸만
export type RunRow = { id: string; trigger: string; status: "queued" | "running" | "succeeded" | "failed" | "partial" };
export type StepRow = { step_name: string; status: "waiting" | "running" | "succeeded" | "failed" | "awaiting_judgment" };
