// 실행 하나를 그림·화살표 건수·상자 상세·실행 목록으로 보여 준다. 관리자 흐름 화면(IA-16)과 내 실행 기록(IA-11)이 같이 쓴다.
// 값은 모두 실제 runs·run_steps 기록에서 온다(불변 6). 칠하는 규칙은 lib/flow/status 그대로.
import Link from "next/link";
import { edgeLabels } from "@/lib/flow/counts";
import { nodeDetail, type NodeDetail } from "@/lib/flow/detail";
import { runLine } from "@/lib/flow/run-list";
import { colorize } from "@/lib/flow/status";
import type { Flow, RunListRow, StepDetail } from "@/lib/flow/types";
import { FlowDiagram, Legend } from "./flow-diagram";

type Props = { flow: Flow; runs: RunListRow[]; picked: RunListRow | null; steps: StepDetail[]; node?: string; basePath: string };

const href = (basePath: string, run?: string, node?: string) => {
  const q = new URLSearchParams();
  if (run) q.set("run", run);
  if (node) q.set("node", node);
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
};

export function DetailPanel({ detail }: { detail: NodeDetail }) {
  return (
    <section aria-label="상자 상세" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "12px 16px", margin: "12px 0", background: "var(--surface)" }}>
      <h2 style={{ margin: "0 0 8px" }}>{detail.name} <small style={{ color: "var(--muted)" }}>({detail.id})</small></h2>
      <h3 style={{ margin: "8px 0 4px", fontSize: 15 }}>설정</h3>
      {detail.config.length === 0 ? <p>설정 없음</p> : (
        <dl style={{ margin: 0 }}>{detail.config.map((f) => <div key={f.label}><dt style={{ display: "inline", fontWeight: 600 }}>{f.label}: </dt><dd style={{ display: "inline", margin: 0 }}>{f.value}</dd></div>)}</dl>
      )}
      <h3 style={{ margin: "12px 0 4px", fontSize: 15 }}>이 실행의 기록</h3>
      {detail.empty ? <p>이 실행에는 이 상자의 기록이 없어요(회색 상자).</p> : detail.steps.map((s, i) => (
        <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : undefined, padding: "6px 0" }}>
          <strong>{s.status}</strong>
          <dl style={{ margin: "4px 0 0" }}>{s.fields.map((f) => <div key={f.label}><dt style={{ display: "inline", fontWeight: 600 }}>{f.label}: </dt><dd style={{ display: "inline", margin: 0, wordBreak: "break-all" }}>{f.value}</dd></div>)}</dl>
        </div>
      ))}
    </section>
  );
}

function RunTable({ flow, runs, picked, basePath }: Pick<Props, "flow" | "runs" | "picked" | "basePath">) {
  if (runs.length === 0) return <p>아직 실행 기록이 없어요.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", minWidth: 560 }}>
        <thead><tr>{["언제", "무엇으로 시작", "결과", "걸린 시간", "처리 건수"].map((h) => <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: "2px solid var(--line)" }}>{h}</th>)}</tr></thead>
        <tbody>
          {runs.map((r) => {
            const line = runLine(flow, r);
            const on = r.id === picked?.id;
            return (
              <tr key={r.id} aria-current={on ? "true" : undefined} style={{ background: on ? "var(--sunken)" : undefined, fontWeight: on ? 700 : 400 }}>
                <td style={{ padding: "6px 10px" }}><Link href={href(basePath, r.id)} style={{ display: "inline-block", minHeight: 44, lineHeight: "44px" }}>{line.when}</Link></td>
                <td style={{ padding: "6px 10px" }}>{line.start}</td>
                <td style={{ padding: "6px 10px" }}>{line.status}</td>
                <td style={{ padding: "6px 10px" }}>{line.took}</td>
                <td style={{ padding: "6px 10px" }}>{line.items}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RunView({ flow, runs, picked, steps, node, basePath }: Props) {
  const colored = colorize(flow, picked, steps);
  const selectedNode = node ? flow.nodes.find((n) => n.id === node) : undefined;
  return (
    <>
      <Legend />
      <p style={{ fontSize: 14, color: "var(--muted)" }}>상자를 누르면 설정과 이 실행의 기록(들어온 것·나간 것·호출·오류)이 아래에 나와요. 화살표 위 숫자는 넘어간 건수예요.</p>
      <FlowDiagram flow={flow} colored={colored} edgeLabels={edgeLabels(flow, steps)}
        nodeHref={(id) => href(basePath, picked?.id, id)} selected={selectedNode?.id} />
      {selectedNode ? <DetailPanel detail={nodeDetail(selectedNode, steps)} /> : null}
      <h2>실행 목록</h2>
      <RunTable flow={flow} runs={runs} picked={picked} basePath={basePath} />
    </>
  );
}
