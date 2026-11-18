"use client";
// 채점 칸(PRD-F30): 버튼 → 서버가 정답 사례 G1–G9를 앱 규칙으로 채점 → 결과 표. 실행 기록은 흐름 화면에서 볼 수 있다.
import Link from "next/link";
import { useActionState } from "react";
import { GRADE_KO } from "@/lib/eval/score";
import { runEvalAction, type EvalState } from "./eval-actions";

const btn = { minHeight: 44, padding: "0 16px" } as const;
const cell = { padding: "4px 8px", borderBottom: "1px solid #e5e7eb", textAlign: "left" as const };

export function EvalPanel({ style }: { style: React.CSSProperties }) {
  const [state, action, pending] = useActionState<EvalState>(runEvalAction, null);
  return (
    <section style={style} aria-labelledby="demo-eval">
      <h2 id="demo-eval" style={{ fontSize: 20, margin: "0 0 4px" }}>채점</h2>
      <p style={{ margin: "4px 0" }}>정답 사례 G1–G9(공개 자료로 정해 둔 기대 등급·기대 사건)를 앱의 등급 규칙으로 다시 채점해요. 저장해 둔 조회 결과만 써서 바깥 호출은 없어요.</p>
      <form action={action}>
        <button type="submit" style={btn} disabled={pending}>{pending ? "채점 중…" : "채점 실행"}</button>
      </form>
      {state && !state.ok ? <p role="alert" style={{ color: "#b91c1c" }}>{state.message}</p> : null}
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
        </div>
      ) : null}
    </section>
  );
}
