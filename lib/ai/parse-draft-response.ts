// Claude의 답을 정해진 모양(스키마)으로 다시 검사한다(SPEC-9). DB·Claude를 모르는 순수 함수.
// 출처는 우리가 넘긴 것(allowedSources)만 인정한다: 지어낸 주소는 버린다. 하나도 안 남으면 빈 목록(화면은 "출처 찾지 못함").
export type DraftParse = { ok: true; draft: string; sources: string[] } | { ok: false; error: string };

export const MAX_DRAFT_CHARS = 1000;

// 모델이 ```json … ``` 로 감싸 오는 경우가 흔해서 벗겨 낸다
const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseDraftResponse(raw: string, allowedSources: string[]): DraftParse {
  const text = raw.trim();
  let value: unknown;
  try {
    value = JSON.parse(FENCE.exec(text)?.[1] ?? text);
  } catch {
    return { ok: false, error: "답이 JSON이 아니에요" };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "답이 객체가 아니에요" };
  const { draft, sources } = value as { draft?: unknown; sources?: unknown };
  if (typeof draft !== "string" || draft.trim() === "") return { ok: false, error: "초안이 비어 있어요" };
  if (draft.trim().length > MAX_DRAFT_CHARS) return { ok: false, error: `초안이 ${MAX_DRAFT_CHARS}자를 넘어요` };
  if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) return { ok: false, error: "출처가 글자 목록이 아니에요" };
  const allowed = new Set(allowedSources);
  return { ok: true, draft: draft.trim(), sources: [...new Set((sources as string[]).filter((s) => allowed.has(s)))] };
}
