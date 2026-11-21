"use client";
// 청사진 대화상자: 질문으로 틀 만들기(한 번에 한 질문, 첫 보기가 추천) · 이 조합으로 확정(프로젝트 고르기). 템플릿은 하단 패널 템플릿 탭, 내보내기는 ③ 결과물 미리보기
import { useState } from "react";
import type { Board } from "@/lib/blueprint/board";
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

export function ConfirmDialog({ name, board, projects, busy, error, onConfirm, onClose }: {
  name: string; board: Board; projects: { id: string; name: string }[]; busy: boolean; error: string; onConfirm: (projectId: string | null) => void; onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const techCount = board.flat().reduce((n, s) => n + s.techs.length, 0);
  return (
    <Dialog title="이 조합으로 확정" onClose={onClose}>
      <p><b>{name}</b> · {flow(board.map((c) => c.map((s) => s.name)))}</p>
      <p className="muted">확정하면 내 이력에 남고, 붙인 기술 {techCount}개의 "내가 쓴 횟수"에 더해져요. 확정한 것은 고치지 않고 쌓여요(다음엔 불러와서 새로 확정).</p>
      <label className="bp-field">어느 프로젝트에 쓸 건가요?
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} data-autofocus="">
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="">프로젝트 없이</option>
        </select>
      </label>
      {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
      <div className="bp-row"><button type="button" className="btn btn-primary" aria-disabled={busy} onClick={() => { if (!busy) onConfirm(projectId || null); }}>{busy ? "확정하는 중…" : "확정"}</button></div>
    </Dialog>
  );
}
