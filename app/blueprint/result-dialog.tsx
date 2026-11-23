"use client";
// 결과물 창(P-12h S1): 위 막대 "확정 · 내보내기" 하나로 연다. 옛 ③ 결과물(StepResult) + 확정 창(ConfirmDialog) + AI 점검(하단 패널 탭)을 한 창에.
// 차례: ① 확정하려면 고칠 것(limitProblems 등) ② 내보내기(형식 · 복사 · 미리보기) ③ 확정(프로젝트 고르기) ④ AI 점검(CheckPanel, 확정한 청사진 기준).
// 확정 · 점검은 서버가 다시 본다(불변 1 · 4 · 5): 실패하면 판은 그대로, 창 안에 이유.
import { useState } from "react";
import type { Board } from "@/lib/blueprint/board";
import { exportMermaid, exportText, linkLines, type ExportKind } from "@/lib/blueprint/export-text";
import { sectionLines } from "@/lib/blueprint/sections";
import type { Graph } from "@/lib/blueprint/graph";
import { Dialog } from "../c-dialog";
import { CheckPanel } from "./check-panel";

const KINDS: [ExportKind, string][] = [["prompt", "프롬프트"], ["md", "CLAUDE.md 글"], ["meta", "다듬기용 메타프롬프트"], ["mermaid", "Mermaid 흐름도(README용, 메모 빼고)"]];
const flow = (b: Board) => b.map((c) => c.map((s) => s.name).join(" + ")).join(" → ");

/** AI 점검에 쓸 확정본: 이 화면에서 방금 확정한 것, 없으면 최근 확정 이력(새로 고쳐도 점검할 수 있게). label은 어느 확정본 · 지금 판과 같은지 사람에게 보이는 말.
 *  null = 확정한 적 없음, "unknown" = 이력을 읽지 못함(확정한 적 없음과 다르게, 불변 2) */
export type CheckTarget = { id: string; label: string } | null | "unknown";
type Props = {
  name: string; board: Board | null; graph: Graph; problems: string[]; /** 확정은 막지 않고 알려만 주는 것(검증, P-12j H4) */ notices: string[]; projects: { id: string; name: string }[];
  /** 지난 확정과 달라진 것(T4): 줄 목록(빈 배열 = 같음), null = 처음 확정, "unknown" = 이력을 못 읽음(불변 2) */ changes: string[] | null | "unknown";
  busy: boolean; error: string; guest: boolean; check: CheckTarget;
  onConfirm: (projectId: string | null) => void; onLogin: () => void; say: (m: string) => void; onClose: () => void;
};

export function ResultDialog(p: Props) {
  const [kind, setKind] = useState<ExportKind>("prompt");
  const [projectId, setProjectId] = useState(p.projects[0]?.id ?? "");
  const text = !p.board ? "" : kind === "mermaid" ? exportMermaid(p.graph) : exportText(kind, p.name, p.board, linkLines(p.graph), sectionLines(p.graph));
  const techCount = p.board ? p.board.flat().reduce((n, s) => n + s.techs.length, 0) : 0;
  const copy = () => (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("보안 연결이 아니면 클립보드가 없음")))
    .then(() => p.say("복사했어요. Claude Code에 붙여 넣어 쓰세요."), () => p.say("복사하지 못했어요. 글을 직접 골라 복사해 주세요."));
  const blocked = !p.board || p.problems.length > 0;
  return (
    <Dialog title="확정 · 내보내기" onClose={p.onClose}>
      <div className="rd">
        <p><b>{p.name}</b>{p.board ? <> · {flow(p.board)}</> : null}</p>
        {p.problems.length ? <div className="notice notice-error" role="status"><strong>확정하려면 고칠 것</strong><ul>{p.problems.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
        {p.notices.length ? <div className="notice" role="status"><strong>알아 둘 것(확정은 돼요)</strong><ul>{p.notices.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}

        <section aria-labelledby="rd-export">
          <h3 id="rd-export" className="rd-h">내보내기</h3>
          <div className="rd-row">
            <label>형식 <select value={kind} onChange={(e) => setKind(e.target.value as ExportKind)} data-autofocus="">{KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <button type="button" className="btn" aria-disabled={p.board ? undefined : true} onClick={() => (p.board ? void copy() : p.say("선이 고리로 이어져 복사할 수 없어요. 고리를 끊어 주세요."))}>복사</button>
          </div>
          {p.board ? <pre className="rd-preview" aria-label="내보내기 미리보기" tabIndex={0}>{text}</pre>
            : <p className="muted">선이 고리로 이어져 순서를 정할 수 없어요. 고리를 끊으면 미리보기가 나와요.</p>}
        </section>

        <section aria-labelledby="rd-confirm">
          <h3 id="rd-confirm" className="rd-h">확정</h3>
          {p.guest ? <p className="muted">확정하면 내 이력에 남아요. 로그인이 필요해요. <button type="button" className="btn" onClick={p.onLogin}>로그인하러 가기</button></p> : <>
            <Changes changes={p.changes} />
            <p className="muted">확정하면 내 이력에 남고, 넣은 기술 {techCount}개의 &quot;내가 쓴 횟수&quot;에 더해져요. 확정한 것은 고치지 않고 쌓여요(다음엔 불러와서 새로 확정).</p>
            <div className="rd-row">
              <label>어느 프로젝트에 쓸 건가요?
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {p.projects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  <option value="">프로젝트 없이</option>
                </select>
              </label>
              <button type="button" className="btn btn-primary" aria-disabled={blocked || p.busy}
                onClick={() => { if (!blocked && !p.busy) p.onConfirm(projectId || null); }}>{p.busy ? "확정하는 중…" : "이대로 확정"}</button>
            </div>
            {blocked && !p.busy ? <p className="muted">위의 고칠 것을 먼저 고치면 확정할 수 있어요.</p> : null}
            {p.error ? <p className="notice notice-error" role="alert">{p.error}</p> : null}
          </>}
        </section>

        <section aria-labelledby="rd-check">
          <h3 id="rd-check" className="rd-h">AI 점검</h3>
          {p.guest ? <p className="muted">로그인하고 확정하면 AI 점검을 받을 수 있어요.</p> : <>
            {p.check === "unknown" ? <p className="notice notice-error" role="alert">확정 이력을 읽지 못해 점검할 확정본을 몰라요. 확정한 게 없다는 뜻이 아니에요. 새로 고치거나 다시 확정해 주세요.</p> : <>
              {p.check ? <p className="muted">점검할 확정본: {p.check.label}</p> : null}
              <CheckPanel blueprintId={p.check?.id ?? null} />
            </>}
          </>}
        </section>
      </div>
    </Dialog>
  );
}

/** 확정 전 "지난 확정과 달라진 것"(Terraform plan처럼, T4). 위치만 옮긴 것은 내용이 같아 넣지 않는다 */
function Changes({ changes }: { changes: string[] | null | "unknown" }) {
  if (changes === "unknown") return <p className="notice notice-error" role="status">확정 이력을 읽지 못해 지난 확정과 비교하지 못했어요. 확정은 그대로 할 수 있어요.</p>;
  if (changes === null) return <p className="muted">처음 확정이에요.</p>;
  if (!changes.length) return <p className="muted">지난 확정과 달라진 것이 없어요 · 같은 확정으로 남아요.</p>;
  return (
    <div className="rd-diff">
      <p><b>지난 확정과 달라진 것</b></p>
      <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
    </div>
  );
}
