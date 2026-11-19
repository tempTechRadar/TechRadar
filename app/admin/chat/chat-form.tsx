"use client";
// 질문 칸과 답(IA-18). 답 아래에 출처 쪽을 보여 준다. 위키에 없으면 "위키에 없습니다".
import { useActionState } from "react";
import { askWikiAction, type ChatState } from "./actions";

export function ChatForm() {
  const [state, action, pending] = useActionState<ChatState, FormData>(askWikiAction, null);
  return (
    <section aria-labelledby="chat-ask">
      <form action={action} style={{ display: "grid", gap: 8, maxWidth: 720 }}>
        <label id="chat-ask" htmlFor="chat-question">위키에 물어보기</label>
        <textarea id="chat-question" name="question" rows={3} maxLength={300} required placeholder="예: 정기 실행은 언제 도나요?" style={{ fontSize: 16, padding: 8 }} />
        <button type="submit" disabled={pending} style={{ minHeight: 44, justifySelf: "start", padding: "0 16px" }}>{pending ? "찾는 중…" : "묻기"}</button>
      </form>
      {state && !state.ok ? <p role="alert" className="admin-note danger">{state.message}</p> : null}
      {state && state.ok ? (
        <div role="status" style={{ marginTop: 12, maxWidth: 720 }}>
          <p className="muted">질문: {state.question}</p>
          <p style={{ whiteSpace: "pre-wrap" }}>{state.answer}</p>
          {state.sources.length > 0 ? <p className="muted">출처: {state.sources.join(", ")}</p> : null}
          {state.saved ? null : <p className="admin-note danger">답은 받았지만 질문 기록을 저장하지 못했어요.</p>}
        </div>
      ) : null}
    </section>
  );
}
