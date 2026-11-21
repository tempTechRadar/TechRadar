// 지도 보기 설정(노션의 묶기·거르기처럼 사용자가 고름): 1~3차 묶기 기준, 색 기준, 거르기. 주소에 싣고 브라우저가 마지막 설정을 기억한다.
// 주소는 누구나 바꿀 수 있는 입력이라 아는 값만 받는다(모르는 기준은 버리고, 거르기 값은 길이·개수를 자른다).
import type { MapNode } from "./build-map.ts";

export const DIMS = ["field", "sub", "kind", "host", "grade", "project"] as const;
export type Dim = (typeof DIMS)[number];
export const DIM_KO: Record<Dim, string> = { field: "하는 일", sub: "세부 갈래", kind: "종류", host: "쓰는 곳", grade: "보안 등급", project: "내 프로젝트" };
export const MAX_LEVELS = 3;

/** mineOnly = "내 기술과 비교군(한 단계)"(ADR 0027), err = 수집 오류만, subs = 세부 갈래 */
export type ViewFilter = { kinds: string[]; fields: string[]; subs: string[]; risky: boolean; mineOnly: boolean; newOnly: boolean; err: boolean; project: string };
/** scope = "이 분류만 보기"로 들어간 경로(바깥부터). 들어간 기준은 묶기에서 빠진다 */
export type Scope = { dim: Dim; value: string };
export type ViewConfig = { group: Dim[]; color: Dim; filter: ViewFilter; scope: Scope[] };
/** 기본 보기(11-21 사용자 결정): 첫 고리 = 종류(MCP · 스킬 · 플러그인 · 패키지 · 개념), 둘째 = 하는 일. 부트캠프 교육생 · 나 같은 사용자가
 *  "스킬이 뭐지, MCP가 뭐지"부터 바로 보게. 색은 첫 고리를 따른다(종류마다 한 색 부채꼴) */
export const DEFAULT_VIEW: ViewConfig = {
  group: ["kind", "field"], color: "kind", scope: [],
  filter: { kinds: [], fields: [], subs: [], risky: false, mineOnly: false, newOnly: false, err: false, project: "" },
};

/** 종류가 하나뿐인 카탈로그(11-21 운영은 공개 목록이 MCP뿐)면 첫 고리가 한 덩어리라 하는 일 먼저로(사용자 결정 "자동") */
export function defaultFor(kindCount: number): ViewConfig {
  return kindCount >= 2 ? DEFAULT_VIEW : { ...DEFAULT_VIEW, group: ["field", "kind"], color: "field" };
}
/** 주소에 묶기(g)가 없을 때만 모델에 맞는 기본 묶기 · 색으로(주소로 고른 보기는 그대로) */
export function withDefault(v: ViewConfig, query: string, kindCount: number): ViewConfig {
  const q = new URLSearchParams(query);
  if (q.has("g")) return v;
  const d = defaultFor(kindCount);
  return { ...v, group: d.group, color: isDim(q.get("c") ?? "") ? v.color : d.color }; // 잘못된 c는 없는 것으로
}

const isDim = (v: string): v is Dim => (DIMS as readonly string[]).includes(v);
const values = (raw: string | null) => (raw ? raw.split(",").map((v) => v.trim().slice(0, 60)).filter(Boolean).slice(0, 20) : []);

export function parseView(query: string | URLSearchParams): ViewConfig {
  const q = typeof query === "string" ? new URLSearchParams(query) : query;
  const group = [...new Set(values(q.get("g")).filter(isDim))].slice(0, MAX_LEVELS);
  const c = q.get("c") ?? "";
  const g = group.length || q.has("g") ? group : DEFAULT_VIEW.group; // g=(빈 값)은 "묶지 않음"
  const scope: Scope[] = [];
  for (const part of (q.get("in") ?? "").split("|").slice(0, 10)) { // in=field:리서치|kind:MCP, 기준마다 한 번, 기준 수(6)보다 깊을 수 없다
    const i = part.indexOf(":"), dim = part.slice(0, i), value = part.slice(i + 1, i + 61);
    if (i > 0 && isDim(dim) && value && !scope.some((x) => x.dim === dim)) scope.push({ dim, value });
  }
  return {
    group: g, scope,
    color: isDim(c) ? c : g[0] ?? DEFAULT_VIEW.color,
    filter: {
      kinds: values(q.get("fk")), fields: values(q.get("ff")), subs: values(q.get("fs")),
      risky: q.get("risky") === "1", mineOnly: q.get("mine") === "1", newOnly: q.get("new") === "1", err: q.get("err") === "1", project: (q.get("p") ?? "").slice(0, 60),
    },
  };
}

/** 들어간 분류의 기준은 이미 하나로 정해졌으니 묶기에서 뺀다 */
export const groupOf = (v: ViewConfig): Dim[] => v.group.filter((d) => !v.scope.some((s) => s.dim === d));

/** 기본값과 다른 것만 주소에 싣는다 */
/** base = 이 지도의 기본 보기(defaultFor): 그와 같은 묶기는 주소에 싣지 않는다 — 되살릴 때 withDefault가 같은 기본을 넣으므로 고른 보기가 그대로 돌아온다 */
export function viewQuery(v: ViewConfig, base: ViewConfig = DEFAULT_VIEW): string {
  const q = new URLSearchParams();
  if (v.group.join() !== base.group.join()) q.set("g", v.group.join(","));
  if (v.color !== (v.group[0] ?? DEFAULT_VIEW.color)) q.set("c", v.color);
  if (v.filter.kinds.length) q.set("fk", v.filter.kinds.join(","));
  if (v.filter.fields.length) q.set("ff", v.filter.fields.join(","));
  if (v.filter.subs.length) q.set("fs", v.filter.subs.join(","));
  if (v.scope.length) q.set("in", v.scope.map((s) => `${s.dim}:${s.value}`).join("|"));
  if (v.filter.err) q.set("err", "1");
  if (v.filter.risky) q.set("risky", "1");
  if (v.filter.mineOnly) q.set("mine", "1");
  if (v.filter.newOnly) q.set("new", "1");
  if (v.filter.project) q.set("p", v.filter.project);
  return q.toString();
}

export function passes(n: MapNode, v: ViewConfig): boolean {
  const f = v.filter;
  return (!f.kinds.length || f.kinds.includes(n.attrs.kind))
    && (!f.fields.length || f.fields.includes(n.attrs.field))
    && (!f.subs.length || f.subs.includes(n.attrs.sub))
    && (!f.risky || n.grade === "danger" || n.grade === "caution")
    && (!f.mineOnly || n.mine || n.nearMine)
    && (!f.newOnly || n.isNew)
    && (!f.err || !!n.collectErrorKind)
    && (!f.project || n.projectIds.includes(f.project))
    && v.scope.every((s) => n.attrs[s.dim] === s.value);
}

/** 켠 필터 수(도구 줄의 "필터 n") */
export const filterCount = (v: ViewConfig) => {
  const f = v.filter;
  return f.kinds.length + f.fields.length + f.subs.length + Number(f.risky) + Number(f.mineOnly) + Number(f.newOnly) + Number(f.err) + Number(!!f.project);
};
