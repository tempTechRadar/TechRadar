// 청사진 가이드 캐릭터 한 번 말하기(P-12s). 대화는 서버에 저장하지 않는다(브라우저 sessionStorage). 서버는 한도를 세고 Claude를 부르고 ai_calls에 남긴다.
// 넘기는 기술 목록은 서버가 만든다(관문 안 내 기술 + 지도 공개 목록): 브라우저가 보낸 id는 믿지 않고 파서가 이 목록으로 다시 거른다.
// AI는 제안만 한다. 판에 넣는 것은 사용자가 누른다(불변 1). 거절 말고는 던지지 않는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildGuidePrompt, GUIDE_TURN_CHARS, GUIDE_TURNS, type GuideTech, type GuideTurn } from "../ai/build-guide-prompt.ts";
import { BLUEPRINT_GUIDE_PER_USER_PER_DAY } from "../ai/decide-ai-call.ts";
import { parseGuideResponse, type GuideReply } from "../ai/parse-guide-response.ts";
import { askWithSlot, countToday, type SlotDeps } from "./ai-slot.ts";

export type GuideResult = { status: "ok"; reply: GuideReply; techs: GuideTech[] } | { status: "failed"; techs?: "unread" } | { status: "refused"; reason: "user_limit" | "service_limit" | "not_configured" | "bad_input" };
type Deps = SlotDeps;
/** loadTechs = 넘길 기술 목록 읽기(한도를 센 뒤에만 부른다: 막힌 요청이 DB를 읽지 않게). 못 읽으면 던진다 */
type Input = { userId: string; turns: unknown; stages: unknown; loadTechs: () => Promise<GuideTech[]>; now?: Date };

const GUIDE_CALL = { maxTokens: 4000, timeoutMs: 60_000 }; // 7단계 + 기술 12개 JSON(한국어)이 기본 2048 안팎이라 넉넉히(잘리면 JSON이 깨져 한 번을 버림)

/** 브라우저에서 온 대화 · 단계 이름 확인(경계 검증): 모양이 틀리면 null */
export function readGuideInput(turns: unknown, stages: unknown): { turns: GuideTurn[]; stages: string[] } | null {
  if (!Array.isArray(turns) || !Array.isArray(stages) || stages.length > 48) return null;
  const t = turns.slice(-GUIDE_TURNS).map((x) => (x ?? {}) as Record<string, unknown>);
  if (!t.every((x) => (x.role === "user" || x.role === "guide") && typeof x.text === "string")) return null;
  if (!stages.every((s) => typeof s === "string")) return null;
  return { turns: t.map((x) => ({ role: x.role as GuideTurn["role"], text: (x.text as string).slice(0, GUIDE_TURN_CHARS) })), stages: (stages as string[]).map((s) => s.slice(0, 20)) };
}

/** 오늘(한국 시간) 내 가이드 호출 수 */
export const countGuideToday = (db: SupabaseClient, userId: string, now: Date) => countToday(db, userId, "blueprint_guide", now);

export async function talkToGuide(deps: Deps, input: Input): Promise<GuideResult> {
  const read = readGuideInput(input.turns, input.stages);
  if (!read) return { status: "refused", reason: "bad_input" };
  let techs: GuideTech[] = [];
  const r = await askWithSlot(deps, {
    purpose: "blueprint_guide", userId: input.userId, limit: BLUEPRINT_GUIDE_PER_USER_PER_DAY, now: input.now,
    build: async () => { techs = await input.loadTechs(); return { ...buildGuidePrompt({ turns: read.turns, stages: read.stages, techs }), ...GUIDE_CALL }; },
    parse: (text) => { const p = parseGuideResponse(text, new Map(techs.map((t) => [t.id, t.grade])), read.stages); if (!p.ok) return p; const { ok: _ok, ...reply } = p; return { ok: true, value: reply }; },
  });
  if (r.status === "ok") return { status: "ok", reply: r.value, techs };
  if (r.status === "failed") return r.unread ? { status: "failed", techs: "unread" } : { status: "failed" };
  return r;
}
