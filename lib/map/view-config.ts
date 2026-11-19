// 지도 보기 설정(노션의 묶기·거르기처럼 사용자가 고름): 1~3차 묶기 기준, 색 기준, 거르기. 주소에 싣고 브라우저가 마지막 설정을 기억한다.
// 주소는 누구나 바꿀 수 있는 입력이라 아는 값만 받는다(모르는 기준은 버리고, 거르기 값은 길이·개수를 자른다).
import type { MapNode } from "./build-map.ts";

export const DIMS = ["field", "sub", "kind", "host", "grade", "project"] as const;
export type Dim = (typeof DIMS)[number];
export const DIM_KO: Record<Dim, string> = { field: "하는 일", sub: "세부 갈래", kind: "종류", host: "쓰는 곳", grade: "보안 등급", project: "내 프로젝트" };
export const MAX_LEVELS = 3;

export type ViewFilter = { kinds: string[]; fields: string[]; risky: boolean; mineOnly: boolean; newOnly: boolean; project: string };
export type ViewConfig = { group: Dim[]; color: Dim; filter: ViewFilter };
export const DEFAULT_VIEW: ViewConfig = { group: ["field", "kind"], color: "field", filter: { kinds: [], fields: [], risky: false, mineOnly: false, newOnly: false, project: "" } };

const isDim = (v: string): v is Dim => (DIMS as readonly string[]).includes(v);
const values = (raw: string | null) => (raw ? raw.split(",").map((v) => v.trim().slice(0, 60)).filter(Boolean).slice(0, 20) : []);

export function parseView(query: string | URLSearchParams): ViewConfig {
  const q = typeof query === "string" ? new URLSearchParams(query) : query;
  const group = [...new Set(values(q.get("g")).filter(isDim))].slice(0, MAX_LEVELS);
  const c = q.get("c") ?? "";
  const g = group.length || q.has("g") ? group : DEFAULT_VIEW.group; // g=(빈 값)은 "묶지 않음"
  return {
    group: g,
    color: isDim(c) ? c : g[0] ?? DEFAULT_VIEW.color,
    filter: {
      kinds: values(q.get("fk")), fields: values(q.get("ff")),
      risky: q.get("risky") === "1", mineOnly: q.get("mine") === "1", newOnly: q.get("new") === "1", project: (q.get("p") ?? "").slice(0, 60),
    },
  };
}

/** 기본값과 다른 것만 주소에 싣는다 */
export function viewQuery(v: ViewConfig): string {
  const q = new URLSearchParams();
  if (v.group.join() !== DEFAULT_VIEW.group.join()) q.set("g", v.group.join(","));
  if (v.color !== (v.group[0] ?? DEFAULT_VIEW.color)) q.set("c", v.color);
  if (v.filter.kinds.length) q.set("fk", v.filter.kinds.join(","));
  if (v.filter.fields.length) q.set("ff", v.filter.fields.join(","));
  if (v.filter.risky) q.set("risky", "1");
  if (v.filter.mineOnly) q.set("mine", "1");
  if (v.filter.newOnly) q.set("new", "1");
  if (v.filter.project) q.set("p", v.filter.project);
  return q.toString();
}

export function passes(n: MapNode, f: ViewFilter): boolean {
  return (!f.kinds.length || f.kinds.includes(n.attrs.kind))
    && (!f.fields.length || f.fields.includes(n.attrs.field))
    && (!f.risky || n.grade === "danger" || n.grade === "caution")
    && (!f.mineOnly || n.mine)
    && (!f.newOnly || n.isNew)
    && (!f.project || n.projectIds.includes(f.project));
}
