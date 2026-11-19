// 취향 질문 3개(PRD-F32, IA-1b): 만드는 것·쓰는 도구·관심 분야. 모두 건너뛸 수 있다. 순수 함수만.
// 첫 판에서 추천 순서에 쓰는 건 관심 분야뿐이다(만드는 것·쓰는 도구는 저장만).
// shortcut: 관심 분야는 갈래 이름(코드의 CATEGORY_SEED)으로 저장한다. 관리자가 큰 갈래 이름을 바꾸면 그 취향은 맞는 갈래가 없어진다. 바뀌면 id로 옮긴다.
import { CATEGORY_SEED } from "../map/classify.ts";

export const BUILD_OPTIONS = [
  { value: "web", label: "웹·앱" }, { value: "automation", label: "자동화·업무" }, { value: "data", label: "데이터·분석" },
  { value: "docs", label: "문서·기획" }, { value: "unsure", label: "아직 모름" },
] as const;
export const TOOL_OPTIONS = [
  { value: "claude_code", label: "Claude Code" }, { value: "cursor", label: "Cursor" },
  { value: "codex_other", label: "Codex·기타" }, { value: "none", label: "아직 없음" },
] as const;
export const INTEREST_OPTIONS: string[] = CATEGORY_SEED.map((c) => c.name);
export const INTEREST_MAX = 3;

export type Taste = { build: string | null; tools: string[]; interests: string[] };
export type TasteCheck = { ok: true; taste: Taste } | { ok: false; error: string };

const BUILD_VALUES: string[] = BUILD_OPTIONS.map((o) => o.value);
const TOOL_VALUES: string[] = TOOL_OPTIONS.map((o) => o.value);
const unique = (xs: string[]) => [...new Set(xs)];

export function validateTaste(input: Taste): TasteCheck {
  const tools = unique(input.tools);
  const interests = unique(input.interests);
  if (input.build !== null && !BUILD_VALUES.includes(input.build)) return { ok: false, error: "만드는 것은 목록에서 골라 주세요" };
  if (tools.some((t) => !TOOL_VALUES.includes(t))) return { ok: false, error: "쓰는 도구는 목록에서 골라 주세요" };
  if (interests.some((i) => !INTEREST_OPTIONS.includes(i))) return { ok: false, error: "관심 분야는 목록에서 골라 주세요" };
  if (interests.length > INTEREST_MAX) return { ok: false, error: `관심 분야는 ${INTEREST_MAX}개까지 고를 수 있어요` };
  return { ok: true, taste: { build: input.build, tools, interests } };
}
