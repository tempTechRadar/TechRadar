"use server";
// 위키 챗봇 묻기(IA-18, PRD-F31). 관리자(= 팀원)만. 서비스 키는 ai_calls 세기·쓰기에만 쓰고, 내 질문 기록은 관리자 본인 클라이언트로 쓴다.
import { revalidatePath } from "next/cache";
import { adminGate } from "@/lib/server/admin-gate";
import { createAnthropicClient } from "@/lib/server/anthropic-client";
import { askWiki } from "@/lib/server/chat";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { readWikiPages } from "@/lib/server/wiki-pages";

export type ChatState =
  | { ok: true; question: string; answer: string; sources: string[]; saved: boolean }
  | { ok: false; message: string }
  | null;

const REFUSED: Record<string, string> = {
  empty_question: "질문을 적어 주세요.",
  too_long: "질문은 300자 안으로 적어 주세요.",
  user_limit: "오늘 질문 20개를 모두 썼어요. 내일 0시(한국 시간)부터 다시 물을 수 있어요.",
  service_limit: "오늘 서비스 전체 Claude 호출 한도(200번)에 닿았어요. 내일 다시 물어봐 주세요.",
  not_configured: "Claude 키가 설정되지 않아 답할 수 없어요(서버 환경변수 ANTHROPIC_API_KEY).",
};

export async function askWikiAction(_previous: ChatState, formData: FormData): Promise<ChatState> {
  const gate = await adminGate();
  if ("blocked" in gate) return { ok: false, message: "관리자만 쓸 수 있어요." };
  const serviceDb = getServiceSupabase();
  if (!serviceDb) return { ok: false, message: "서버 연결 설정이 없어 지금은 물을 수 없어요." };
  const question = String(formData.get("question") ?? "");
  const result = await askWiki(
    { userDb: gate.db, serviceDb, ai: createAnthropicClient(), pages: readWikiPages(process.cwd()) },
    { userId: gate.user.id, question },
  );
  revalidatePath("/admin/chat");
  if (result.status === "answered") return { ok: true, question: question.trim(), answer: result.answer, sources: result.sources, saved: result.saved };
  if (result.status === "refused") return { ok: false, message: REFUSED[result.reason] };
  return { ok: false, message: "답을 만들지 못했어요. 잠시 뒤에 다시 물어봐 주세요." };
}
