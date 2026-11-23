// 보기 묶음(노션의 보기 탭처럼, 11-21 사용자): 이름 + 보기 주소(viewQuery 모양). 기본 묶음은 코드에, "지금 보기 저장"은 브라우저에 5개까지.
// 브라우저 저장값은 누구나 바꿀 수 있는 입력이라 모양 · 길이 · 개수를 자른다(보기 해석은 parseView가 아는 값만 받는다).
export type Preset = { name: string; query: string };
/** login = 로그인해야 뜻이 있음, mine = 내 기술이 있어야 뜻이 있음 */
export type BuiltinPreset = Preset & { login?: boolean; mine?: boolean };

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  { name: "입문자 추천", query: new URLSearchParams({ fk: "스킬,플러그인,개념,개발 도구" }).toString() }, // MCP 말고 먼저 알면 좋은 것(입문 세트가 여기 모임, ADR 0031)
  { name: "이번 주 새 기술", query: "t=week" },
  { name: "보안 위험", query: "risky=1&c=grade" },
  { name: "내 관심", query: "mk=interest", login: true },
  { name: "사용 중", query: "mine=1", mine: true },
  { name: "LS점프업", query: "pick=ls" }, // 바이브코딩에 바로 쓰는 것(규칙 + 고른 목록, isLsJumpUp)
];
/** LS점프업 보기의 한 줄 설명(보기 탭 title) */
export const LS_NOTE = "바이브코딩에 바로 쓰는 것: 클로드코드 스킬 · 플러그인 · 개념 · 코딩 도구 · AI 작업 방식 + 고른 목록";

/** LS점프업 고른 목록(tech_key): 규칙에 안 걸려도 넣는 것. 목록에 있는데 지도에 아직 없으면 들어오는 날 자동으로 보인다 */
export const LS_PICKS = new Set([
  "concept:skills", "concept:subagents", "concept:hooks", "concept:slash-commands", "concept:harness", "concept:plan-mode", "concept:context-engineering", "concept:headless",
]);
/** LS점프업(P-12p 사용자): 규칙(스킬 · 플러그인 · 개념 · 개발 도구(코딩 CLI) · "AI 작업 방식" 분야) 또는 고른 목록. 위험 등급도 숨기지 않는다(지도 규칙대로 등급 표시) */
export function isLsJumpUp(n: { type: string | null; techKey: string | null; attrs: { field: string } }): boolean {
  return n.type === "skill" || n.type === "plugin" || n.type === "concept" || n.type === "sdk" || n.attrs.field === "AI 작업 방식" || (!!n.techKey && LS_PICKS.has(n.techKey));
}
export const MAX_SAVED = 5;
const NAME_MAX = 20, QUERY_MAX = 600;

const clean = (p: unknown): Preset | null => {
  if (!p || typeof p !== "object") return null;
  const { name, query } = p as Record<string, unknown>;
  if (typeof name !== "string" || typeof query !== "string") return null;
  const n = name.trim().slice(0, NAME_MAX);
  return n && query.length <= QUERY_MAX ? { name: n, query } : null;
};

/** 브라우저에 둔 목록 읽기. 깨진 값은 빈 목록 */
export function parsePresets(raw: string | null): Preset[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.map(clean).filter((p): p is Preset => p !== null).slice(0, MAX_SAVED) : [];
  } catch { return []; }
}

/** 같은 이름은 바꿔 쓰고, 새 이름은 앞에. 5개를 넘으면 가장 오래된 것부터 뺀다. 이름이 비면 그대로 */
export function addPreset(list: Preset[], name: string, query: string): Preset[] {
  const p = clean({ name, query });
  return p ? [p, ...list.filter((x) => x.name !== p.name)].slice(0, MAX_SAVED) : list;
}
