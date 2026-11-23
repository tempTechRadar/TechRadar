// 위키 챗봇(IA-18, PRD-F31). 팀원 = 관리자만. 서비스 안 AI 기능과 따로 둔다. 일반 사용자에게 내부 문서를 보여 주지 않는다.
// 페이지는 관리자 확인 · 읽기만, 그림은 body.tsx(I-admin-unify).
import { CHATBOT_PER_USER_PER_DAY, startOfKoreanDay } from "@/lib/ai/decide-ai-call";
import { adminGate } from "@/lib/server/admin-gate";
import { readMyRecentChats } from "@/lib/server/chat";
import type { Row } from "@/lib/server/alert-db";
import { AdminShell } from "../admin-shell";
import { ChatBody, TITLE } from "./body";

export default async function ChatPage() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="chat" title={TITLE} blocked={gate.blocked} />;
  let recent: Row[] = [];
  let error: string | null = null;
  try {
    recent = await readMyRecentChats(gate.db, gate.user.id, CHATBOT_PER_USER_PER_DAY); // 20줄이면 오늘 쓴 수를 다 센다
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const since = new Date(startOfKoreanDay(new Date())).getTime();
  // 서버 한도와 같은 셈(lib/server/chat.ts): 오늘 chat_logs + Claude 호출이 실패해 ai_calls에만 남은 내 줄(검토 R2)
  const failedRes = await gate.db.from("ai_calls").select("id", { count: "exact", head: true })
    .eq("user_id", gate.user.id).eq("purpose", "chatbot").eq("status", "failed").gte("created_at", new Date(since).toISOString());
  const failedToday = failedRes.error || typeof failedRes.count !== "number" ? null : failedRes.count;
  const usedToday = recent.filter((r) => new Date(r.created_at).getTime() >= since).length + (failedToday ?? 0);
  return <ChatBody recent={recent} usedToday={usedToday} failedToday={failedToday} error={error} />;
}
