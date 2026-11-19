// 흐름 그림의 글 대체(PRD-NF5 "이미지 대체 텍스트"). 순수 함수. 그림 아래 "그림을 글로 보기"가 이것을 그린다.
// 켜진 상자(이번 실행이 지나간 상자)는 이름과 상태 글자로, 화살표는 지나간 것(굵은 선)과 건수가 있는 것만 적는다(상자 36개를 다 읽게 하지 않음).
import { LOOK } from "./look.ts";
import type { Colored } from "./status.ts";
import type { Flow } from "./types.ts";

export type FlowTextAlt = { boxes: string[]; arrows: string[]; offCount: number };

export function flowTextAlt(flow: Flow, colored: Colored, edgeLabels: Map<string, string>): FlowTextAlt {
  const name = new Map(flow.nodes.map((n) => [n.id, n.name]));
  const stateOf = (id: string) => colored.states[id] ?? "off";
  const lit = flow.nodes.filter((n) => stateOf(n.id) !== "off");
  const arrows = flow.edges
    .filter((e) => colored.boldEdges.has(`${e.from}>${e.to}`) || edgeLabels.has(`${e.from}>${e.to}`))
    .map((e) => {
      const count = edgeLabels.get(`${e.from}>${e.to}`);
      return `${name.get(e.from) ?? e.from} → ${name.get(e.to) ?? e.to} (${e.when})${count ? ` · ${count}` : ""}`;
    });
  return { boxes: lit.map((n) => `${n.name}: ${LOOK[stateOf(n.id)].label}`), arrows, offCount: flow.nodes.length - lit.length };
}
