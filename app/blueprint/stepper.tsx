"use client";
// 스텝퍼(P-12e, 게임식 흐름): ① 단계 구축 → ② 스킬 붙이기 → ③ 결과물. 같은 화면에서 모드만 바뀐다(되돌아가도 판은 그대로).
// ③ 결과물: 확정 조건 어긋남(limitProblems) · 내보내기 실시간 미리보기(exportText) · 확정. 점검 받기 · 템플릿 저장은 서버 조각(F · I)이 오면 연다.
import { useState } from "react";
import { exportText, type ExportKind } from "@/lib/blueprint/export-text";
import type { Board } from "@/lib/blueprint/board";
import type { Step } from "./studio-types";

const STEPS: [Step, string, string][] = [
  [1, "단계 구축", "단계를 더하고 선으로 순서를 이어요"],
  [2, "스킬 붙이기", "아래 기술을 단계로 끌어 놓아요"],
  [3, "결과물", "미리 보고 확정 · 내보내요"],
];
const KINDS: [ExportKind, string][] = [["prompt", "프롬프트"], ["md", "CLAUDE.md 글"], ["meta", "다듬기용 메타프롬프트"]];

export function Stepper({ step, onStep }: { step: Step; onStep: (s: Step) => void }) {
  return (
    <nav className="st" aria-label="만드는 단계">
      {STEPS.map(([s, name, hint]) => (
        <button key={s} type="button" className="st-step" aria-current={step === s ? "step" : undefined} title={hint} onClick={() => onStep(s)}>
          <span className="st-num" aria-hidden="true">{s}</span>{name}
        </button>
      ))}
    </nav>
  );
}

/** board = 그래프를 순서대로 편 것(고리가 있으면 null). problems = 확정 조건 어긋남 */
export function StepResult({ name, board, problems, onConfirm, say }: {
  name: string; board: Board | null; problems: string[]; onConfirm: () => void; say: (m: string) => void;
}) {
  const [kind, setKind] = useState<ExportKind>("prompt");
  const text = board ? exportText(kind, name, board) : "";
  const copy = () => navigator.clipboard.writeText(text).then(() => say("복사했어요. Claude Code에 붙여 넣어 쓰세요."), () => say("복사하지 못했어요. 글을 직접 골라 복사해 주세요."));
  return (
    <section className="st-result" aria-labelledby="st-result-h">
      <h2 id="st-result-h" className="sr-only">결과물</h2>
      {problems.length ? (
        <div className="notice notice-error" role="status"><strong>확정하려면 고칠 것</strong><ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      ) : null}
      <div className="st-row">
        <label>내보내기 <select value={kind} onChange={(e) => setKind(e.target.value as ExportKind)}>{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <button type="button" className="btn" disabled={!board} onClick={() => void copy()}>복사</button>
        <span className="st-grow" />
        <button type="button" className="btn" disabled title="AI 점검은 곧 열려요">점검 받기(준비 중)</button>
        <button type="button" className="btn btn-primary" disabled={!board || problems.length > 0} onClick={onConfirm}>이 조합으로 확정</button>
      </div>
      {board ? <pre className="st-preview" aria-label="내보내기 미리보기" tabIndex={0}>{text}</pre> : <p className="muted">선이 고리로 이어져 순서를 정할 수 없어요. 고리를 끊으면 미리보기가 나와요.</p>}
    </section>
  );
}
