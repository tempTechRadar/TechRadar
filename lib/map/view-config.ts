// 지도 보기 설정(노션의 묶기·거르기처럼 사용자가 고름): 1~3차 묶기 기준, 색 기준, 거르기. 주소에 싣고 브라우저가 마지막 설정을 기억한다.
// 주소는 누구나 바꿀 수 있는 입력이라 아는 값만 받는다(모르는 기준은 버리고, 거르기 값은 길이·개수를 자른다).
import { KIND_KO, MANUAL_KIND, UNSORTED, type MapNode } from "./build-map.ts";
import { isLsJumpUp } from "./presets.ts";

export const DIMS = ["field", "sub", "kind", "host", "grade", "project"] as const;
export type Dim = (typeof DIMS)[number];
export const DIM_KO: Record<Dim, string> = { field: "하는 일", sub: "세부 갈래", kind: "종류", host: "쓰는 곳", grade: "보안 등급", project: "프로젝트" };
export const MAX_LEVELS = 3;

/** 기간 칩: 들어온 지 하루 · 7일 · 30일 안(11-21 사용자: 일 · 주 · 월 보기) */
export const PERIODS = ["day", "week", "month"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 };
export const PERIOD_KO: Record<Period, string> = { day: "오늘", week: "이번 주", month: "이번 달" };
/** 기간 칩 하나에 드는지(칩 수 · 필터 · 새로 들어온 것 보기가 같은 판정을 쓴다) */
/** 지도에 올리는 최근 30일 새 기술 몫(서버 map-queries가 이만큼 읽음). 기간 보기는 이 안에서만 보여 화면이 안내한다 */
export const NEW_QUOTA = 100;
export const inPeriod = (n: Pick<MapNode, "addedDays">, p: Period) => n.addedDays !== null && n.addedDays < PERIOD_DAYS[p];
/** mineOnly = "사용 중"(사용 중인 항목만, P-12m: 비교군은 지도에 두지 않음), err = 수집 오류만, subs = 세부 갈래, interest = 내가 관심 표시한 것만, tags = 내 태그 중 하나라도 붙은 것 */
export type ViewFilter = { /** pick=ls: LS점프업(P-12p) */ ls: boolean; kinds: string[]; fields: string[]; subs: string[]; risky: boolean; mineOnly: boolean; period: Period | ""; marks: MarkPick[]; hot: boolean; err: boolean; project: string; tags: string[] };
/** 내 판단으로 거르기(P-12f 보드 녹이기: 옛 보드의 칸 = 지도의 판단 칩). 고른 것 중 하나라도 맞으면 보인다 */
export const MARK_PICKS = ["interest", "candidate", "hold"] as const;
export type MarkPick = (typeof MARK_PICKS)[number];
const isMarkPick = (v: string): v is MarkPick => (MARK_PICKS as readonly string[]).includes(v);
/** scope = "이 분류만 보기"로 들어간 경로(바깥부터). 들어간 기준은 묶기에서 빠진다 */
export type Scope = { dim: Dim; value: string };
export type ViewConfig = { group: Dim[]; color: Dim; filter: ViewFilter; scope: Scope[] };
/** 기본 보기(11-21 사용자 결정): 첫 고리 = 종류(MCP · 스킬 · 플러그인 · 개발 도구 · 개념), 둘째 = 하는 일. 부트캠프 교육생 · 나 같은 사용자가
 *  "스킬이 뭐지, MCP가 뭐지"부터 바로 보게. 색은 첫 고리를 따른다(종류마다 한 색 부채꼴) */
export const DEFAULT_VIEW: ViewConfig = {
  group: ["kind", "field"], color: "kind", scope: [],
  filter: { ls: false, kinds: [], fields: [], subs: [], risky: false, mineOnly: false, period: "", marks: [], hot: false, err: false, project: "", tags: [] },
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
const isPeriod = (v: string): v is Period => (PERIODS as readonly string[]).includes(v);
const values = (raw: string | null) => (raw ? raw.split(",").map((v) => v.trim().slice(0, 60)).filter(Boolean).slice(0, 20) : []);
/** 11-21에 바꾼 글자(ADR 0030 11항): 저장된 보기 · 공유 주소의 옛 값이 아무것도 안 맞는 필터가 되지 않게 새 값으로 */
const RENAMED: Record<string, string> = { 패키지: KIND_KO.sdk, 모름: MANUAL_KIND, "분류 전": UNSORTED };
const renamed = (raw: string | null) => [...new Set(values(raw).map((v) => RENAMED[v] ?? v))];

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
      ls: q.get("pick") === "ls",
      kinds: renamed(q.get("fk")), fields: renamed(q.get("ff")), subs: renamed(q.get("fs")),
      risky: q.get("risky") === "1", mineOnly: q.get("mine") === "1", marks: q.get("mk") === "1" ? ["interest"] : [...new Set(values(q.get("mk")).filter(isMarkPick))], /* mk=1 = P-12f 전의 "내 관심만" */ hot: q.get("hot") === "1", err: q.get("err") === "1", project: (q.get("p") ?? "").slice(0, 60),
      tags: [...new Set(q.getAll("tg").map((t) => t.trim().slice(0, 30)).filter(Boolean))].slice(0, 10), // 태그에 쉼표가 들어갈 수 있어 tg=를 여러 번
      period: isPeriod(q.get("t") ?? "") ? q.get("t") as Period : q.get("new") === "1" ? "week" : "", // new=1 = 기간 칩 전의 "NEW만" 주소
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
  if (v.filter.ls) q.set("pick", "ls");
  if (v.filter.err) q.set("err", "1");
  if (v.filter.risky) q.set("risky", "1");
  if (v.filter.mineOnly) q.set("mine", "1");
  if (v.filter.period) q.set("t", v.filter.period);
  if (v.filter.marks.length) q.set("mk", MARK_PICKS.filter((m) => v.filter.marks.includes(m)).join(","));
  if (v.filter.project) q.set("p", v.filter.project);
  if (v.filter.hot) q.set("hot", "1");
  for (const t of v.filter.tags) q.append("tg", t);
  return q.toString();
}

export function passes(n: MapNode, v: ViewConfig): boolean {
  const f = v.filter;
  return (!f.ls || isLsJumpUp(n))
    && (!f.kinds.length || f.kinds.includes(n.attrs.kind))
    && (!f.fields.length || f.fields.includes(n.attrs.field))
    && (!f.subs.length || f.subs.includes(n.attrs.sub))
    && (!f.risky || n.grade === "danger" || n.grade === "caution")
    && (!f.mineOnly || n.mine)
    && (!f.period || inPeriod(n, f.period))
    && (!f.marks.length || (!!n.decided && f.marks.includes(n.decided)))
    && (!f.hot || n.hot)
    && (!f.err || !!n.collectErrorKind)
    && (!f.project || n.projectIds.includes(f.project))
    && (!f.tags.length || n.tags.some((t) => f.tags.some((x) => x.toLowerCase() === t.toLowerCase()))) // 기술마다 대소문자를 하나로 보지만 기술끼리는 표기가 다를 수 있다
    && v.scope.every((s) => n.attrs[s.dim] === s.value);
}

/** 켠 필터 수(도구 줄의 "필터 n") */
export const filterCount = (v: ViewConfig) => {
  const f = v.filter;
  return Number(f.ls) + f.kinds.length + f.fields.length + f.subs.length + Number(f.risky) + Number(f.mineOnly) + Number(!!f.period) + f.marks.length + Number(f.hot) + Number(f.err) + Number(!!f.project) + f.tags.length;
};
