// 청사진 가이드 캐릭터 한 번 말하기(P-12s). 대화는 서버에 저장하지 않는다(브라우저 sessionStorage). 서버는 한도를 세고 Claude를 부르고 ai_calls에 남긴다.
// 넘기는 기술 목록은 서버가 만든다(관문 안 내 기술 + 지도 공개 목록): 브라우저가 보낸 id는 믿지 않고 파서가 이 목록으로 다시 거른다.
// AI는 제안만 한다. 판에 넣는 것은 사용자가 누른다(불변 1). 거절 말고는 던지지 않는다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildGuidePrompt, GUIDE_TURN_CHARS, GUIDE_TURNS, type GuideTech, type GuideTurn } from "../ai/build-guide-prompt.ts";
import { BLUEPRINT_GUIDE_PER_USER_PER_DAY, decideAiCall, startOfKoreanDay } from "../ai/decide-ai-call.ts";
import { parseGuideResponse, type GuideReply } from "../ai/parse-guide-response.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";

export type GuideResult = { status: "ok"; reply: GuideReply; techs: GuideTech[] } | { status: "failed"; techs?: "unread" } | { status: "refused"; reason: "user_limit" | "service_limit" | "not_configured" | "bad_input" };
type Deps = { serviceDb: SupabaseClient; ai: AiClient | null };
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
export async function countGuideToday(db: SupabaseClient, userId: string, now: Date): Promise<number> {
  return rowsOrThrow(await db.from("ai_calls").select("id").eq("user_id", userId).eq("purpose", "blueprint_guide").gte("created_at", startOfKoreanDay(now)), "오늘 가이드 호출 수를 읽지 못함").length;
}

/** 부르기 전에 자리를 먼저 잡는다(한도를 동시에 여러 번 눌러 넘지 않게, 보안 검토): 상태 칸은 succeeded · failed뿐이라 "실패 · 응답 대기"로 넣고 끝나면 고친다.
 *  끊기면 그대로 실패로 남아 한도에 센다(안전한 쪽). 못 넣으면 부르지 않는다 */
async function reserve(db: SupabaseClient, row: Row): Promise<string> {
  const { data, error } = await db.from("ai_calls").insert({ purpose: "blueprint_guide", status: "failed", error: "응답 대기 중", ...row }).select("id").single();
  if (error || !data) throw new Error(`ai_calls 자리를 잡지 못함: ${error?.message ?? "빈 응답"}`);
  return (data as Row).id as string;
}
async function settle(db: SupabaseClient, id: string, row: Row): Promise<void> {
  const { error } = await db.from("ai_calls").update(row).eq("id", id);
  if (error) console.error("ai_calls를 고치지 못함", maskSecrets(error.message));
}

export async function talkToGuide(deps: Deps, input: Input): Promise<GuideResult> {
  const now = input.now ?? new Date();
  const read = readGuideInput(input.turns, input.stages);
  if (!read) return { status: "refused", reason: "bad_input" };
  try {
    const [mine, service] = await Promise.all([
      countGuideToday(deps.serviceDb, input.userId, now),
      deps.serviceDb.from("ai_calls").select("id").gte("created_at", startOfKoreanDay(now)).then((r) => rowsOrThrow(r, "오늘 호출 수를 읽지 못함").length),
    ]);
    const decision = decideAiCall("blueprint_guide", { changeHasDraft: false, userCallsToday: mine, serviceCallsToday: service });
    if (!decision.allow) return { status: "refused", reason: decision.reason === "user_limit" ? "user_limit" : "service_limit" };
    if (!deps.ai) return { status: "refused", reason: "not_configured" };
    let techs: GuideTech[];
    try { techs = await input.loadTechs(); } catch (error) {
      console.error("가이드 기술 목록 읽기 실패", maskSecrets(error instanceof Error ? error.message : String(error)));
      return { status: "failed", techs: "unread" }; // 못 읽은 목록을 빈 목록으로 넘기지 않는다(불변 2)
    }
    const prompt = buildGuidePrompt({ turns: read.turns, stages: read.stages, techs });
    const slot = await reserve(deps.serviceDb, { user_id: input.userId, input_hash: createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex") });
    // 내 자리를 넣은 뒤 다시 센다: 동시에 넣은 요청은 서로를 보고 물러난다(넘게 부르지는 않음, blueprint-check와 같은 방식)
    if ((await countGuideToday(deps.serviceDb, input.userId, now)) > BLUEPRINT_GUIDE_PER_USER_PER_DAY) {
      await settle(deps.serviceDb, slot, { error: "한도(동시 요청)" });
      return { status: "refused", reason: "user_limit" };
    }
    let answer: Awaited<ReturnType<AiClient["complete"]>>;
    try {
      answer = await deps.ai.complete({ ...prompt, ...GUIDE_CALL });
    } catch (error) {
      await settle(deps.serviceDb, slot, { error: cleanForLog(error instanceof Error ? error.message : String(error)) ?? "" });
      return { status: "failed" };
    }
    const tokens = { tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null };
    const parsed = parseGuideResponse(answer.text, new Map(techs.map((t) => [t.id, t.grade])), read.stages);
    await settle(deps.serviceDb, slot, { ...tokens, status: parsed.ok ? "succeeded" : "failed", error: parsed.ok ? null : parsed.error });
    if (!parsed.ok) return { status: "failed" };
    const { ok: _ok, ...reply } = parsed;
    return { status: "ok", reply, techs };
  } catch (error) {
    console.error("청사진 가이드 실패", maskSecrets(error instanceof Error ? error.message : String(error)));
    return { status: "failed" };
  }
}
