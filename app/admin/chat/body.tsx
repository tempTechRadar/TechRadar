// 위키 챗봇 본문(관리자 화면 문법). 페이지(읽기 · 관리자 확인)와 개발용 견본이 같이 쓴다.
// 숫자 띠 = 오늘 남은 질문(서버 한도와 같은 셈: 오늘 chat_logs + 실패한 ai_calls 내 줄). 실패 수를 못 읽었으면 그렇다고 밝힌다(불변 2).
import { CHATBOT_PER_USER_PER_DAY } from "@/lib/ai/decide-ai-call";
import type { Row } from "@/lib/server/alert-db";
import { AdminShell, when } from "../admin-shell";
import { AdminEmpty, AdminSection, AdminSummary } from "../admin-ui";
import { ChatForm } from "./chat-form";

export const TITLE = "위키 챗봇";
const PROVES = "답이 위키 안의 출처 쪽에서만 오고, 없으면 지어내지 않고, 문서끼리 다르면 양쪽 출처를 함께 말한다는 것";
const LEAD = "프로젝트 위키(wiki/)에서 맞는 쪽을 찾아 그 쪽만 Claude에 보내 답해요. 답 아래에 출처 쪽이 나오고, 위키에 없으면 \"위키에 없습니다\"라고 해요.";
const TOOLBAR = { links: [{ href: "/admin/demo", label: "실패 시연과 채점" }, { href: "/admin/simulator", label: "시뮬레이터" }] };

/** usedToday: 오늘 쓴 질문 수(성공 + 셀 수 있었던 실패). failedToday: 실패한 질문 수, 못 읽었으면 null */
export type ChatBodyProps = { recent: Row[]; usedToday: number; failedToday: number | null; error?: string | null };

export function ChatBody({ recent, usedToday, failedToday, error }: ChatBodyProps) {
  const left = Math.max(0, CHATBOT_PER_USER_PER_DAY - usedToday);
  const note = failedToday === null ? "실패한 질문 수를 읽지 못해 성공한 질문만 셌어요" : failedToday > 0 ? `실패한 질문 ${failedToday}개도 한도에 들어가요` : undefined;
  return (
    <AdminShell tab="chat" title={TITLE} lead={LEAD} proves={PROVES} error={error} toolbar={TOOLBAR}>
      <AdminSummary label="오늘 질문 한도" items={[{ value: `${left} / ${CHATBOT_PER_USER_PER_DAY}`, label: "오늘 남은 질문", note }]} />
      <ChatForm />
      <AdminSection id="chat-recent" title="내 최근 질문">
        {recent.length === 0 ? <AdminEmpty>아직 없어요.</AdminEmpty> : (
          <ul className="admin-list">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="muted">{when(r.created_at)}</span> {r.question}
                <br />→ {r.answer}{Array.isArray(r.wiki_pages) && r.wiki_pages.length ? <span className="muted"> (출처: {r.wiki_pages.join(", ")})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </AdminShell>
  );
}
