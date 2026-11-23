// 하루 한도가 있는 대화형 AI 한 번 부르기(P-12s 청사진 가이드 · P-12w 지도 찾기가 같이 씀). 대화는 서버에 저장하지 않고 ai_calls에 호출 기록만 남긴다.
// 순서: 오늘 내 수 · 전체 수 세기 → 한도(decideAiCall) → 재료 읽기(한도 뒤: 막힌 요청이 DB를 읽지 않게, 못 읽으면 부르지 않음 · 불변 2)
//   → ai_calls 자리 먼저 잡고 다시 세기(동시 요청으로 한도를 넘지 않게, 보안 검토) → 부르기 → 결과로 그 줄을 고침. 거절 말고는 던지지 않는다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient, AiPrompt } from "../ai/ai-client.ts";
import { decideAiCall, startOfKoreanDay, type AiPurpose } from "../ai/decide-ai-call.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";

export type SlotDeps = { serviceDb: SupabaseClient; ai: AiClient | null };
export type SlotResult<T> = { status: "ok"; value: T } | { status: "failed"; unread?: true } | { status: "refused"; reason: "user_limit" | "service_limit" | "not_configured" };
type Ask<T> = {
  purpose: AiPurpose; userId: string; limit: number; now?: Date;
  /** 재료를 읽어 프롬프트를 만든다. 못 읽으면 던진다(→ unread) */ build: () => Promise<AiPrompt>;
  parse: (text: string) => { ok: true; value: T } | { ok: false; error: string };
};

/** 오늘(한국 시간) 이 사람이 이 용도로 부른 수 */
export async function countToday(db: SupabaseClient, userId: string, purpose: AiPurpose, now: Date): Promise<number> {
  return rowsOrThrow(await db.from("ai_calls").select("id").eq("user_id", userId).eq("purpose", purpose).gte("created_at", startOfKoreanDay(now)), "오늘 호출 수를 읽지 못함").length;
}

export async function askWithSlot<T>(deps: SlotDeps, a: Ask<T>): Promise<SlotResult<T>> {
  const now = a.now ?? new Date(), db = deps.serviceDb;
  try {
    const [mine, service] = await Promise.all([
      countToday(db, a.userId, a.purpose, now),
      db.from("ai_calls").select("id").gte("created_at", startOfKoreanDay(now)).then((r) => rowsOrThrow(r, "오늘 호출 수를 읽지 못함").length),
    ]);
    const decision = decideAiCall(a.purpose, { changeHasDraft: false, userCallsToday: mine, serviceCallsToday: service });
    if (!decision.allow) return { status: "refused", reason: decision.reason === "user_limit" ? "user_limit" : "service_limit" };
    if (!deps.ai) return { status: "refused", reason: "not_configured" };
    let prompt: AiPrompt;
    try { prompt = await a.build(); } catch (error) {
      console.error(`${a.purpose} 재료 읽기 실패`, maskSecrets(error instanceof Error ? error.message : String(error)));
      return { status: "failed", unread: true }; // 못 읽은 목록을 빈 목록으로 넘기지 않는다(불변 2)
    }
    // 상태 칸은 succeeded · failed뿐이라 "실패 · 응답 대기"로 넣고 끝나면 고친다. 끊기면 실패로 남아 한도에 센다(안전한 쪽). 못 넣으면 부르지 않는다
    const hash = createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex");
    const ins = await db.from("ai_calls").insert({ purpose: a.purpose, user_id: a.userId, input_hash: hash, status: "failed", error: "응답 대기 중" }).select("id").single();
    if (ins.error || !ins.data) throw new Error(`ai_calls 자리를 잡지 못함: ${ins.error?.message ?? "빈 응답"}`);
    const slot = (ins.data as Row).id as string;
    const settle = async (row: Row) => { const { error } = await db.from("ai_calls").update(row).eq("id", slot); if (error) console.error("ai_calls를 고치지 못함", maskSecrets(error.message)); };
    if ((await countToday(db, a.userId, a.purpose, now)) > a.limit) { await settle({ error: "한도(동시 요청)" }); return { status: "refused", reason: "user_limit" }; }
    let answer: Awaited<ReturnType<AiClient["complete"]>>;
    try { answer = await deps.ai.complete(prompt); } catch (error) {
      await settle({ error: cleanForLog(error instanceof Error ? error.message : String(error)) ?? "" });
      return { status: "failed" };
    }
    const parsed = a.parse(answer.text);
    await settle({ tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null, status: parsed.ok ? "succeeded" : "failed", error: parsed.ok ? null : parsed.error });
    return parsed.ok ? { status: "ok", value: parsed.value } : { status: "failed" };
  } catch (error) {
    console.error(`${a.purpose} 실패`, maskSecrets(error instanceof Error ? error.message : String(error)));
    return { status: "failed" };
  }
}
