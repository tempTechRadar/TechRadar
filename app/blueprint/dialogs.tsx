"use client";
// 청사진 대화상자: 질문으로 틀 만들기(한 번에 한 질문, 첫 보기가 추천). 확정 · 내보내기 · AI 점검은 결과물 창(result-dialog.tsx), 템플릿은 하단 패널 불러오기 탭
import { useState } from "react";
import { buildFromAnswers, QUESTIONS } from "@/lib/blueprint/knowledge";
import { Dialog } from "../c-dialog";

const flow = (cols: string[][]) => cols.map((c) => c.join(" + ")).join(" → ");

/** replacing = 지금 판에 단계가 있음: 마지막 확인에서 "바꾸기"로 묻는다(브라우저 기본 확인 창 대신 같은 대화상자 안에서) */
export function InterviewDialog({ onMake, onClose, replacing = false }: { onMake: (cols: string[][]) => void; onClose: () => void; replacing?: boolean }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Record<string, string>>({});
  const q = QUESTIONS[step];
  if (!q) {
    const cols = buildFromAnswers(a);
    return (
      <Dialog title="이렇게 만들까요?" onClose={onClose} focusKey="done">
        <p>{flow(cols)}</p>
        <p className="muted">{replacing ? "지금 판 대신 이 틀로 바꿔요. 되돌리기를 누르면 지금 판으로 돌아와요." : "만든 뒤에도 단계를 옮기거나 더하고 뺄 수 있어요."}</p>
        <div className="bp-row">
          <button type="button" className="btn btn-primary" data-autofocus="" onClick={() => onMake(cols)}>{replacing ? "지금 판을 이 틀로 바꾸기" : "이렇게 만들기"}</button>
          <button type="button" className="btn" onClick={() => { setStep(0); setA({}); }}>처음부터 다시</button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title={q.q} onClose={onClose} focusKey={step}>
      <p className="muted">질문 {step + 1} / {QUESTIONS.length}</p>
      <div className="bp-opts" key={q.id}>{q.opts.map(([v, label], i) => (
        <button key={v} type="button" className="btn bp-opt" data-autofocus={i === 0 ? "" : undefined} onClick={() => { setA({ ...a, [q.id]: v }); setStep(step + 1); }}>
          {label}{i === 0 ? <span className="bp-rec">추천</span> : null}
        </button>
      ))}</div>
      {step ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>이전 질문</button> : null}
    </Dialog>
  );
}
