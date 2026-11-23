// 청사진 가이드 캐릭터 한 번 말하기(P-12s). 대화는 서버에 저장하지 않는다(브라우저 sessionStorage). 서버는 한도를 세고 Claude를 부르고 ai_calls에 남긴다.
// 넘기는 기술 목록은 서버가 만든다(관문 안 내 기술 + 지도 공개 목록): 브라우저가 보낸 id는 믿지 않고 파서가 이 목록으로 다시 거른다.
// AI는 제안만 한다. 판에 넣는 것은 사용자가 누른다(불변 1). 거절 말고는 던지지 않는다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildGuidePrompt, GUIDE_TURN_CHARS, GUIDE_TURNS, type GuideTech, type GuideTurn } from "../ai/build-guide-prompt.ts";
import { decideAiCall, startOfKoreanDay } from "../ai/decide-ai-call.ts";
import { parseGuideResponse, type GuideReply } from "../ai/parse-guide-response.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";

export type GuideResult = { status: "ok"; reply: GuideReply } | { status: "failed" } | { status: "refused"; reason: "user_limit" | "service_limit" | "not_configured" | "bad_input" };
type Deps = { serviceDb: SupabaseClient; ai: AiClient | null };
type Input = { userId: string; turns: unknown; stages: unknown; techs: GuideTech[]; now?: Date };

const GUIDE_CALL = { maxTokens: 2000, timeoutMs: 60_000 }; // 7단계 + 기술 12개 JSON(한국어)이 기본 2048 안팎이라 넉넉히

/** 브라우저에서 온 대화 · 단계 이름 확인(경계 검증): 모양이 틀리면 null */
export function readGuideInput(turns: unknown, stages: unknown): { turns: GuideTurn[]; stages: string[] } | null {
  if (!Array.isArray(turns) || !Array.isArray(stages) || stages.length > 48) return null;
  const t = turns.slice(-GUIDE_TURNS).map((x) => (x ?? {}) as Record<string, unknown>);
  if (!t.every((x) => (x.role === "user" || x.role === "guide") && typeof x.text === "string")) return null;
  if (!stages.every((s) => typeof s === "string")) return null;
  return { turns: t.map((x) => ({ role: x.role as GuideTurn["role"], text: (x.text as string).slice(0, GUIDE_TURN_CHARS) })), stages: (stages as string[]).map((s) => s.slice(0, 20)) };
}

/** 오늘(한국 시간) 내 가이드 호출 수 */
export async function countGuideToday(db: SupabaseClient, userId: string, now: Date): Promise<number> {
  return rowsOrThrow(await db.from("ai_calls").select("id").eq("user_id", userId).eq("purpose", "blueprint_guide").gte("created_at", startOfKoreanDay(now)), "오늘 가이드 호출 수를 읽지 못함").length;
}

async function logCall(db: SupabaseClient, row: Row): Promise<void> {
  const { error } = await db.from("ai_calls").insert({ purpose: "blueprint_guide", ...row });
  if (error) console.error("ai_calls를 기록하지 못함", maskSecrets(error.message));
}

export async function talkToGuide(deps: Deps, input: Input): Promise<GuideResult> {
  const now = input.now ?? new Date();
  const read = readGuideInput(input.turns, input.stages);
  if (!read) return { status: "refused", reason: "bad_input" };
  try {
    const mine = await countGuideToday(deps.serviceDb, input.userId, now);
    const service = rowsOrThrow(await deps.serviceDb.from("ai_calls").select("id").gte("created_at", startOfKoreanDay(now)), "오늘 호출 수를 읽지 못함").length;
    const decision = decideAiCall("blueprint_guide", { changeHasDraft: false, userCallsToday: mine, serviceCallsToday: service });
    if (!decision.allow) return { status: "refused", reason: decision.reason === "user_limit" ? "user_limit" : "service_limit" };
    if (!deps.ai) return { status: "refused", reason: "not_configured" };
    const prompt = buildGuidePrompt({ turns: read.turns, stages: read.stages, techs: input.techs });
    const base = { user_id: input.userId, input_hash: createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex") };
    let answer: Awaited<ReturnType<AiClient["complete"]>>;
    try {
      answer = await deps.ai.complete({ ...prompt, ...GUIDE_CALL });
    } catch (error) {
      await logCall(deps.serviceDb, { ...base, status: "failed", error: cleanForLog(error instanceof Error ? error.message : String(error)) ?? "" });
      return { status: "failed" };
    }
    const tokens = { tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null };
    const parsed = parseGuideResponse(answer.text, new Map(input.techs.map((t) => [t.id, t.grade])), read.stages);
    await logCall(deps.serviceDb, { ...base, ...tokens, status: parsed.ok ? "succeeded" : "failed", ...(parsed.ok ? {} : { error: parsed.error }) });
    if (!parsed.ok) return { status: "failed" };
    const { ok: _ok, ...reply } = parsed;
    return { status: "ok", reply };
  } catch (error) {
    console.error("청사진 가이드 실패", maskSecrets(error instanceof Error ? error.message : String(error)));
    return { status: "failed" };
  }
}
