"use client";
// 질문 칸과 답(IA-18). 답 아래에 출처 쪽을 보여 준다. 위키에 없으면 "위키에 없습니다".
// 11-23 리뉴얼: 정답표(docs/wiki-chat.md) 예시 질문 칩. 누르면 질문 칸만 채우고, 묻기는 사람이 누른다(한도 20개를 칩이 쓰지 않게).
import { useActionState, useRef } from "react";
import { askWikiAction, type ChatState } from "./actions";

// docs/wiki-chat.md 정답표 Q1–Q5 질문 문장 그대로(바꾸면 정답표와 함께)
const ANSWER_SHEET_QUESTIONS: { id: string; question: string }[] = [
  { id: "Q1", question: "정기 실행은 언제 도나요?" },
  { id: "Q2", question: "관리자도 자기 알림에 판단을 저장할 수 있나요?" },
  { id: "Q3", question: "\"같은 역할\" 관계는 어떻게 확정되나요?" },
  { id: "Q4", question: "운영 Supabase DB는 얼마나 자주 백업하나요?" },
  { id: "Q5", question: "챗봇 \"한 사람 하루 20개\" 한도는 어느 표를 세서 거나요?" },
];

export function ChatForm() {
  const [state, action, pending] = useActionState<ChatState, FormData>(askWikiAction, null);
  const box = useRef<HTMLTextAreaElement>(null);
  const fill = (q: string) => {
    if (!box.current) return;
    box.current.value = q;
    box.current.focus();
  };
  return (
    <section aria-labelledby="chat-ask">
      <h2 id="chat-examples">정답표 예시 질문</h2>
      <p className="muted">누르면 질문 칸에 채워져요. 묻기는 직접 눌러 주세요. Q4는 위키에 없는 질문, Q5는 문서끼리 말이 다른 질문이에요.</p>
      <ul className="admin-chips" aria-labelledby="chat-examples">
        {ANSWER_SHEET_QUESTIONS.map((q) => (
          <li key={q.id}><button type="button" className="admin-chip" onClick={() => fill(q.question)}><b>{q.id}</b>{q.question}</button></li>
        ))}
      </ul>
      <form action={action} className="admin-chat">
        <label id="chat-ask" htmlFor="chat-question">위키에 물어보기</label>
        <textarea ref={box} id="chat-question" name="question" rows={3} maxLength={300} required placeholder="예: 정기 실행은 언제 도나요?" />
        <button type="submit" className="primary" disabled={pending}>{pending ? "찾는 중…" : "묻기"}</button>
      </form>
      {state && !state.ok ? <p role="alert" className="admin-note danger">{state.message}</p> : null}
      {state && state.ok ? (
        <div role="status" className="admin-answer">
          <p className="muted">질문: {state.question}</p>
          <p className="answer-text">{state.answer}</p>
          {state.sources.length > 0 ? <p className="muted">출처: {state.sources.join(", ")}</p> : null}
          {state.saved ? null : <p className="admin-note danger">답은 받았지만 질문 기록을 저장하지 못했어요.</p>}
        </div>
      ) : null}
    </section>
  );
}
