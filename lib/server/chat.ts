// 위키 챗봇 묻기(PRD-F31, IA-18, SPEC-9). 주인: 차세일(C). 서비스 안 AI 기능과 따로 둔다(관리자 = 팀원만).
// userDb(로그인한 관리자: 내 chat_logs 세기·쓰기, RLS user_id = 본인)와 serviceDb(서버: ai_calls 세기·쓰기)를 받는다.
// 규칙은 decideAiCall·findWikiPages·buildChatPrompt·parseChatResponse(순수 함수)가 정하고, 여기서는 읽기·쓰기·기록만 한다.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiClient } from "../ai/ai-client.ts";
import { buildChatPrompt, NOT_IN_WIKI } from "../ai/build-chat-prompt.ts";
import { decideAiCall, startOfKoreanDay } from "../ai/decide-ai-call.ts";
import { parseChatResponse } from "../ai/parse-chat-response.ts";
import { cleanForLog, maskSecrets } from "../domain/redact.ts";
import { findWikiPages, type WikiPage } from "../wiki/find-pages.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";

export const MAX_QUESTION_CHARS = 300;

export type ChatResult =
  | { status: "answered"; answer: string; sources: string[]; saved: boolean }
  | { status: "refused"; reason: "empty_question" | "too_long" | "user_limit" | "service_limit" | "not_configured" }
  | { status: "failed"; reason: string };

type Deps = { userDb: SupabaseClient; serviceDb: SupabaseClient; ai: AiClient | null; pages: WikiPage[] };
type Input = { userId: string; question: string; now?: Date };

async function logCall(db: SupabaseClient, row: Row): Promise<void> {
  const { error } = await db.from("ai_calls").insert({ purpose: "chatbot", ...row });
  if (error) console.error("ai_calls를 기록하지 못함", maskSecrets(error.message));
}

/** 질문·찾은 쪽·답을 남긴다. 실패해도 답은 보여 준다(saved=false) */
async function saveChat(db: SupabaseClient, userId: string, question: string, answer: string, sources: string[]): Promise<boolean> {
  const { error } = await db.from("chat_logs").insert({ user_id: userId, question, answer, wiki_pages: sources });
  if (error) console.error("chat_logs를 기록하지 못함", maskSecrets(error.message));
  return !error;
}

async function callClaude(deps: Deps, ai: AiClient, userId: string, question: string, pages: WikiPage[]): Promise<ChatResult> {
  const prompt = buildChatPrompt(question, pages);
  const base = { user_id: userId, input_hash: createHash("sha256").update(`${prompt.system}\n${prompt.user}`).digest("hex") };
  let answer: Awaited<ReturnType<AiClient["complete"]>>;
  try {
    answer = await ai.complete({ system: prompt.system, user: prompt.user });
  } catch (error) {
    const reason = cleanForLog(error instanceof Error ? error.message : String(error)) ?? "";
    await logCall(deps.serviceDb, { ...base, status: "failed", error: reason });
    return { status: "failed", reason };
  }
  const tokens = { tokens_in: answer.tokensIn ?? null, tokens_out: answer.tokensOut ?? null };
  const parsed = parseChatResponse(answer.text, prompt.allowedSources);
  if (!parsed.ok) {
    await logCall(deps.serviceDb, { ...base, ...tokens, status: "failed", error: parsed.error });
    return { status: "failed", reason: parsed.error };
  }
  await logCall(deps.serviceDb, { ...base, ...tokens, status: "succeeded" });
  const saved = await saveChat(deps.userDb, userId, question, parsed.answer, parsed.sources);
  return { status: "answered", answer: parsed.answer, sources: parsed.sources, saved };
}

async function ask(deps: Deps, input: Input): Promise<ChatResult> {
  const question = input.question.trim();
  if (!question) return { status: "refused", reason: "empty_question" };
  if (question.length > MAX_QUESTION_CHARS) return { status: "refused", reason: "too_long" };
  const since = startOfKoreanDay(input.now ?? new Date());
  const mine = rowsOrThrow(await deps.userDb.from("chat_logs").select("id").eq("user_id", input.userId).gte("created_at", since), "오늘 질문 수를 읽지 못함");
  const service = rowsOrThrow(await deps.serviceDb.from("ai_calls").select("id").gte("created_at", since), "오늘 호출 수를 읽지 못함");
  const decision = decideAiCall("chatbot", { changeHasDraft: false, userCallsToday: mine.length, serviceCallsToday: service.length });
  if (!decision.allow) return { status: "refused", reason: decision.reason === "user_limit" ? "user_limit" : "service_limit" };
  const pages = findWikiPages(question, deps.pages);
  // 맞는 쪽이 없으면 Claude를 부르지 않는다(비용 0). 그래도 질문은 남겨 하루 20개에 센다
  if (pages.length === 0) return { status: "answered", answer: NOT_IN_WIKI, sources: [], saved: await saveChat(deps.userDb, input.userId, question, NOT_IN_WIKI, []) };
  if (!deps.ai) {
    console.warn("위키 챗봇: ANTHROPIC_API_KEY가 없어 부르지 않았어요");
    return { status: "refused", reason: "not_configured" };
  }
  return callClaude(deps, deps.ai, input.userId, question, pages);
}

/** 거절 말고는 던지지 않는다: 읽기 실패도 "failed"로 돌려 화면이 안내한다 */
export async function askWiki(deps: Deps, input: Input): Promise<ChatResult> {
  try {
    return await ask(deps, input);
  } catch (error) {
    const reason = maskSecrets(error instanceof Error ? error.message : String(error));
    console.error("위키 챗봇 실패", reason);
    return { status: "failed", reason };
  }
}

/** 내 최근 질문(화면용). 못 읽으면 던진다(없다고 속이지 않음) */
export async function readMyRecentChats(db: SupabaseClient, userId: string, limit = 10): Promise<Row[]> {
  const { data, error } = await db.from("chat_logs").select("id, created_at, question, answer, wiki_pages").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`최근 질문을 읽지 못함: ${maskSecrets(error.message)}`);
  return (data ?? []) as Row[];
}
