// 위키 챗봇 답 검사(PRD-F31). 순수 함수. 출처는 넘긴 위키 쪽만 인정하고, 출처가 없으면 지어낸 것으로 보고 "위키에 없습니다"로 바꾼다(SPEC-9).
import { NOT_IN_WIKI } from "./build-chat-prompt.ts";

export const MAX_ANSWER_CHARS = 800; // chat_logs.answer 검사(char_length <= 800)와 같다

export type ChatParse = { ok: true; answer: string; sources: string[] } | { ok: false; error: string };

function firstJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function parseChatResponse(text: string, allowedSources: string[]): ChatParse {
  const body = firstJson(text) as { answer?: unknown; sources?: unknown } | null;
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer) return { ok: false, error: "챗봇 답 모양이 맞지 않음(JSON answer 없음)" };
  if (answer === NOT_IN_WIKI) return { ok: true, answer, sources: [] };
  const given = Array.isArray(body?.sources) ? body.sources.filter((s): s is string => typeof s === "string") : [];
  const sources = [...new Set(given.filter((s) => allowedSources.includes(s)))];
  if (sources.length === 0) return { ok: true, answer: NOT_IN_WIKI, sources: [] };
  // 넘치면 자른다: 저장(DB 검사)에서 통째로 실패하는 것보다 답을 보여 주는 쪽이 낫다
  const clipped = answer.length > MAX_ANSWER_CHARS ? `${answer.slice(0, MAX_ANSWER_CHARS - 1)}…` : answer;
  return { ok: true, answer: clipped, sources };
}
