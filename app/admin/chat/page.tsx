// 위키 챗봇(IA-18, PRD-F31). 팀원 = 관리자만. 서비스 안 AI 기능과 따로 둔다. 일반 사용자에게 내부 문서를 보여 주지 않는다.
import { CHATBOT_PER_USER_PER_DAY, startOfKoreanDay } from "@/lib/ai/decide-ai-call";
import { adminGate } from "@/lib/server/admin-gate";
import { readMyRecentChats } from "@/lib/server/chat";
import type { Row } from "@/lib/server/alert-db";
import { AdminShell, when } from "../admin-shell";
import { ChatForm } from "./chat-form";

const LEAD = "프로젝트 위키(wiki/)에서 맞는 쪽을 찾아 그 쪽만 Claude에 보내 답해요. 답 아래에 출처 쪽이 나오고, 위키에 없으면 \"위키에 없습니다\"라고 해요.";

export default async function ChatPage() {
  const gate = await adminGate();
  if ("blocked" in gate) return <AdminShell tab="chat" title="위키 챗봇" blocked={gate.blocked} />;
  let recent: Row[] = [];
  let error: string | null = null;
  try {
    recent = await readMyRecentChats(gate.db, gate.user.id, CHATBOT_PER_USER_PER_DAY); // 20줄이면 오늘 쓴 수를 다 센다
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const since = new Date(startOfKoreanDay(new Date())).getTime();
  const usedToday = recent.filter((r) => new Date(r.created_at).getTime() >= since).length;
  return (
    <AdminShell tab="chat" title="위키 챗봇" lead={LEAD} error={error}>
      <p className="muted">오늘 남은 질문: {Math.max(0, CHATBOT_PER_USER_PER_DAY - usedToday)} / {CHATBOT_PER_USER_PER_DAY}개 · 답은 800자 안</p>
      <ChatForm />
      <h2>내 최근 질문</h2>
      {recent.length === 0 ? <p>아직 없어요.</p> : (
        <ul>
          {recent.map((r) => (
            <li key={r.id} style={{ marginBottom: 8 }}>
              <span className="muted">{when(r.created_at)}</span> {r.question}
              <br />→ {r.answer}{Array.isArray(r.wiki_pages) && r.wiki_pages.length ? <span className="muted"> (출처: {r.wiki_pages.join(", ")})</span> : null}
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
