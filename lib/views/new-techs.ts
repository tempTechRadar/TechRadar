// 새 기술(/new, design.md 13절 3): 하는 일 갈래별로 묶는다. 많이 들어온 갈래 먼저, 분류 전은 맨 뒤. 갈래 안은 위험·주의 먼저, 그다음 이름순.
import { UNSORTED, type MapNode } from "../map/build-map.ts";

export type NewGroup = { field: string; nodes: MapNode[] };
const sev = (n: MapNode) => (n.grade === "danger" ? 0 : n.grade === "caution" ? 1 : 2);

export function groupByField(nodes: MapNode[]): NewGroup[] {
  const by = new Map<string, MapNode[]>();
  for (const n of nodes) by.set(n.attrs.field, [...(by.get(n.attrs.field) ?? []), n]);
  return [...by].map(([field, list]) => ({ field, nodes: list.sort((a, b) => sev(a) - sev(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) }))
    .sort((a, b) => Number(a.field === UNSORTED) - Number(b.field === UNSORTED) || b.nodes.length - a.nodes.length || a.field.localeCompare(b.field, "ko"));
}
