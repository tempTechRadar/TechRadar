"use client";
// 채점 칸(PRD-F30): 버튼 → 서버가 정답 사례 G1–G9를 앱 규칙으로 채점 → 결과 표. 실행 기록은 흐름 화면에서 볼 수 있다.
import Link from "next/link";
import { useActionState } from "react";
import { EDGE_KINDS, type EdgeRow, type EdgeScore } from "@/lib/eval/edge-score";
import { GRADE_KO } from "@/lib/eval/score";
import type { StoredEdges } from "@/lib/eval/stored-edges";
import { runEvalAction, type EvalState } from "./eval-actions";

const btn = { minHeight: "var(--hit)", padding: "0 16px" } as const;
const cell = { padding: "4px 8px", borderBottom: "1px solid var(--line-d)", textAlign: "left" as const };

export function EvalPanel({ style }: { style: React.CSSProperties }) {
  const [state, action, pending] = useActionState<EvalState>(runEvalAction, null);
  return (
    <section style={style} aria-labelledby="demo-eval">
      <h2 id="demo-eval" style={{ fontSize: 20, margin: "0 0 4px" }}>채점</h2>
      <p style={{ margin: "4px 0" }}>정답 사례 G1–G9(공개 자료로 정해 둔 기대 등급·기대 사건)를 앱의 등급 규칙으로 다시 채점해요. 저장해 둔 조회 결과만 써서 바깥 호출은 없어요.</p>
      <form action={action}>
        <button type="submit" style={btn} disabled={pending}>{pending ? "채점 중…" : "채점 실행"}</button>
      </form>
      {state && !state.ok ? <p role="alert" style={{ color: "var(--ink-danger)" }}>{state.message}</p> : null}
      {state && state.ok ? (
        <div role="status">
          <p style={{ margin: "8px 0 4px" }}>
            {state.when} · 사례 {state.score.totals.cases} · 맞게 울림 {state.score.totals.hit} · 맞게 조용함 {state.score.totals.quietOk} ·{" "}
            <b>놓침 {state.score.totals.miss}</b> · <b>잘못 울림 {state.score.totals.falseAlarm}</b> · 등급 맞음 {state.score.totals.gradeOk}/{state.score.totals.cases} · 실행 실패 {state.score.totals.failed}
          </p>
          <p style={{ margin: "0 0 8px" }}><Link href={`/admin/flow?run=${state.runId}`}>흐름 화면에서 이 채점 실행 보기</Link></p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 640, fontSize: 14 }}>
              <thead><tr>{["사례", "대상", "출처", "기대 등급", "실제 등급", "등급", "사건 판정", "비고"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
              <tbody>
                {state.score.rows.map((r) => (
                  <tr key={r.id}>
                    <td style={cell}>{r.id}</td><td style={cell}>{r.target}</td><td style={cell}>{r.origin}</td><td style={cell}>{r.expectedGrade}</td>
                    <td style={cell}>{GRADE_KO[r.actualGrade]}</td><td style={cell}>{r.gradeOk ? "맞음" : "다름"}</td><td style={cell}>{r.verdict}</td><td style={cell}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StoredEdgesView stored={state.stored} />
        </div>
      ) : null}
    </section>
  );
}

/** 경계 사례는 방금 채점한 것이 아니라 저장된 결과다: 제목과 시각으로 구분해 보여 준다 */
function StoredEdgesView({ stored }: { stored: StoredEdges }) {
  return (
    <section aria-labelledby="demo-eval-edges" style={{ marginTop: 16 }}>
      <h3 id="demo-eval-edges" style={{ fontSize: 16, margin: "0 0 4px" }}>사건 종류·경계 사례 (저장된 결과)</h3>
      {!stored.ok ? <p style={{ color: "var(--ink-danger)", margin: "4px 0" }}>{stored.reason}</p> : <StoredEdgesTables when={stored.when} edges={stored.edges} />}
    </section>
  );
}

function StoredEdgesTables({ when, edges }: { when: string; edges: EdgeScore }) {
  const t = edges.totals;
  const wrong = edges.rows.filter((r) => r.verdict !== "맞음");
  return (
    <>
      <p style={{ margin: "4px 0" }}>
        방금 누른 채점이 아니라 <code>npm run eval</code>이 {when}에 저장한 결과예요(경계 사례는 화면에서 다시 돌리지 않아요). 사례 {t.cases} · 맞게 울림 {t.hit} · 맞게 조용함 {t.quietOk} ·{" "}
        <b>놓침 {t.miss}</b> · <b>잘못 울림 {t.falseAlarm}</b> · <b>결과 다름 {t.outcomeWrong}</b> · 실행 실패 {t.failed}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
          <thead><tr>{["종류", "사례", "맞음", "놓침", "잘못 울림", "결과 다름"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
          <tbody>
            {EDGE_KINDS.filter((k) => edges.byKind[k]).map((k) => (
              <tr key={k}>
                <td style={cell}>{k}</td><td style={cell}>{edges.byKind[k].cases}</td><td style={cell}>{edges.byKind[k].right}</td>
                <td style={cell}>{edges.byKind[k].miss}</td><td style={cell}>{edges.byKind[k].falseAlarm}</td><td style={cell}>{edges.byKind[k].outcomeWrong}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ margin: "8px 0 4px" }}>{wrong.length === 0 ? "맞음이 아닌 사례는 없어요." : `맞음이 아닌 사례 ${wrong.length}건:`}</p>
      {wrong.length > 0 ? <EdgeRows rows={wrong} /> : null}
      <details style={{ marginTop: 8 }}>
        <summary style={{ minHeight: "var(--hit)", display: "flex", alignItems: "center", cursor: "pointer" }}>사례 {edges.rows.length}건 모두 보기</summary>
        <EdgeRows rows={edges.rows} />
      </details>
    </>
  );
}

function EdgeRows({ rows }: { rows: EdgeRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 640, fontSize: 14 }}>
        <thead><tr>{["사례", "종류", "대상", "출처", "기대 결과", "실제 결과", "판정", "비고"].map((h) => <th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={cell}>{r.id}</td><td style={cell}>{r.kind}</td><td style={cell}>{r.target}</td><td style={cell}>{r.source}</td>
              <td style={cell}>{r.expectedOutcome}</td><td style={cell}>{r.actualOutcome}</td><td style={cell}>{r.verdict}</td><td style={cell}>{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
