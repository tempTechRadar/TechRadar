// 실제 기록(runs·run_steps)에서 상자 색을 정한다. 기록에 없는 색은 칠하지 않는다(불변 6, docs/flow.md 3절).
import { reachableEdges } from "./layout.ts";
import type { Flow, RunRow, StepRow } from "./types.ts";

/** off 안 켜짐 · running 실행 중 · ok 성공 · bad 실패 · wait 판단 대기 · disabled 꺼 둔 상자(3순위) */
export type NodeState = "off" | "running" | "ok" | "bad" | "wait" | "disabled";

// 한 상자에 기록이 여러 줄이면(기술마다 한 줄 등) 더 나쁜 쪽을 보인다: 일부만 실패해도 빨강
const WORST: Record<StepRow["status"], { rank: number; state: NodeState }> = {
  failed: { rank: 4, state: "bad" },
  awaiting_judgment: { rank: 3, state: "wait" },
  running: { rank: 2, state: "running" },
  succeeded: { rank: 1, state: "ok" },
  waiting: { rank: 0, state: "off" },
};

const START_STATE: Record<RunRow["status"], NodeState> = {
  queued: "running",
  running: "running",
  succeeded: "ok",
  partial: "ok",
  failed: "bad",
};

export type Colored = { states: Record<string, NodeState>; activeStart: string | null; boldEdges: Set<string> };

/** 시작 상자 하나에서 갈 수 있는 상자·화살표(flow.json 연결 기준). 길만 고를 뿐 색(실제 기록)은 그대로다(불변 6) */
export function pathFrom(flow: Flow, startId: string): { nodes: Set<string>; edges: Set<string> } {
  const edges = reachableEdges(flow, startId);
  return { edges, nodes: new Set([startId, ...[...edges].map((k) => k.split(">")[1])]) };
}

export function colorize(flow: Flow, run: RunRow | null, steps: StepRow[]): Colored {
  const startNode = run ? flow.nodes.find((n) => n.type === "start" && n.run_trigger === run.trigger) : undefined;
  const best = new Map<string, StepRow["status"]>();
  for (const s of steps) {
    const now = best.get(s.step_name);
    if (!now || WORST[s.status].rank > WORST[now].rank) best.set(s.step_name, s.status);
  }
  const states: Record<string, NodeState> = {};
  for (const n of flow.nodes) {
    const step = best.get(n.id);
    if (n.type === "start") states[n.id] = n.id === startNode?.id && run ? START_STATE[run.status] : "off";
    else if (step) states[n.id] = WORST[step].state;
    else states[n.id] = n.enabled === false ? "disabled" : "off";
  }
  return { states, activeStart: startNode?.id ?? null, boldEdges: startNode ? reachableEdges(flow, startNode.id) : new Set() };
}
