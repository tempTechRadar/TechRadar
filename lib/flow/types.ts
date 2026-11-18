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
  /** 상자 설정(읽기 전용, 비밀값 없음). 상자를 누르면 보여 준다 */
  config?: Record<string, unknown>;
};

export type FlowEdge = { from: string; to: string; when: string };
export type Flow = { nodes: FlowNode[]; edges: FlowEdge[] };

// runs·run_steps에서 칠하는 데 쓰는 칸만
export type RunRow = { id: string; trigger: string; status: "queued" | "running" | "succeeded" | "failed" | "partial" };
export type StepRow = { step_name: string; status: "waiting" | "running" | "succeeded" | "failed" | "awaiting_judgment" };

/** 화살표 건수·상자 상세에 쓰는 run_steps 칸. 요약·주소·오류는 저장할 때 이미 가려져 있다(SPEC-8). */
export type StepDetail = StepRow & {
  input_summary?: string | null;
  output_summary?: string | null;
  api_url?: string | null;
  http_status?: number | null;
  duration_ms?: number | null;
  count_in?: number | null;
  count_out?: number | null;
  branch_counts?: Record<string, number> | null;
  error_kind?: string | null;
  error_message?: string | null;
};

/** 실행 목록 한 줄에 쓰는 runs 칸 */
export type RunListRow = RunRow & { created_at: string; started_at: string | null; finished_at: string | null; item_count: number };
