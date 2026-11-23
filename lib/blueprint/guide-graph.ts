// 가이드가 제안한 단계를 판에 넣기(P-12s). 사용자가 [판에 넣기]를 누를 때만 부른다(불변 1). 순수 함수.
// replace = 빈 판으로 바꾸고 차례로 잇기, append = 지금 판 맨 끝 단계 뒤에 차례로 잇기. 이름은 판 규칙대로 다듬고, 한도(LIMITS)를 넘는 것은 넣지 않는다.
import { cleanName } from "./board.ts";
import { addStage, autoLayout, connect, createStage, emptyGraph, layers, LIMITS, type Graph } from "./graph.ts";

export function addGuideStages(g: Graph, names: string[], mode: "replace" | "append"): Graph {
  let next = mode === "replace" ? emptyGraph() : g;
  const l = layers(next);
  let prev = l.ok && l.levels.length ? l.levels[l.levels.length - 1] : [];
  let depth = l.ok ? l.levels.length : LIMITS.depth;
  const have = new Set(next.stages.map((s) => s.name));
  for (const name of names) {
    if (depth >= LIMITS.depth || have.has(cleanName(name))) continue; // 깊이 한도 · 같은 이름(기술 제안이 이름으로 단계를 찾음)
    const s = createStage(name, 0, 0);
    const added = addStage(next, s);
    if (added === next) continue; // 빈 이름 · 단계 수 한도
    next = prev.reduce((acc, from) => connect(acc, from, s.id), added);
    prev = [s.id]; depth++; have.add(s.name);
  }
  return autoLayout(next);
}
