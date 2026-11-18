// 흐름 그림(SVG). 색은 colorize()가 실제 기록에서 정한 값만 쓴다(불변 6). 색만으로 구분하지 않게 글자로도 적는다.
import { LABEL_H, labelWidth, placeLabel, type Rect } from "@/lib/flow/edge-label";
import { BOX, layoutFlow } from "@/lib/flow/layout";
import type { Colored, NodeState } from "@/lib/flow/status";
import type { Flow } from "@/lib/flow/types";

const LOOK: Record<NodeState, { fill: string; stroke: string; label: string; dash?: string }> = {
  off: { fill: "#eceae4", stroke: "#b9b4a8", label: "안 켜짐" },
  running: { fill: "#bddcf7", stroke: "#2f7fc4", label: "실행 중" },
  ok: { fill: "#bfe8cf", stroke: "#2e9a5f", label: "성공" },
  bad: { fill: "#f7c6c1", stroke: "#d6453b", label: "실패" },
  wait: { fill: "#fff1d6", stroke: "#e08a00", label: "판단 대기", dash: "6 4" },
  disabled: { fill: "#f6f5f1", stroke: "#cfcabe", label: "꺼 둠(3순위)", dash: "3 4" },
};


/** 이름을 한 줄 11자 안팎, 최대 두 줄로 나눈다. */
function wrap(name: string): string[] {
  const words = name.split(" ");
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + w).length <= 11) lines[lines.length - 1] = last + " " + w;
    else lines.push(w);
  }
  const out = lines.slice(0, 2);
  if (lines.length > 2) out[1] = out[1].slice(0, 10) + "…";
  return out;
}

export function Legend() {
  return (
    <ul style={{ display: "flex", flexWrap: "wrap", gap: 12, listStyle: "none", padding: 0, margin: "8px 0", fontSize: 14 }}>
      {(Object.keys(LOOK) as NodeState[]).map((s) => (
        <li key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 16, height: 16, borderRadius: 4, background: LOOK[s].fill, border: `2px ${LOOK[s].dash ? "dashed" : "solid"} ${LOOK[s].stroke}` }} />
          {LOOK[s].label}
        </li>
      ))}
    </ul>
  );
}

type DiagramProps = {
  flow: Flow;
  colored: Colored;
  /** 화살표("from>to") 위에 쓸 건수(lib/flow/counts). 없으면 숫자를 쓰지 않는다 */
  edgeLabels?: Map<string, string>;
  /** 상자를 누르면 갈 주소(상세 보기). 없으면 누를 수 없다 */
  nodeHref?: (id: string) => string;
  selected?: string;
};

/** 자리(r)는 placeLabel이 상자와 겹치지 않게 고른다 */
function EdgeLabel({ r, text }: { r: Rect; text: string }) {
  return (
    <g transform={`translate(${r.x} ${r.y})`} aria-hidden="true">
      <rect width={r.w} height={LABEL_H} rx={LABEL_H / 2} fill="#fff" stroke="#8a857a" />
      <text x={r.w / 2} y={13} textAnchor="middle" fontSize={11} fontWeight={600} fill="#2c2a26">{text}</text>
    </g>
  );
}

export function FlowDiagram({ flow, colored, edgeLabels, nodeHref, selected }: DiagramProps) {
  const layout = layoutFlow(flow);
  const { nodes, edges, width, height } = layout;
  return (
    <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12, background: "#fbfaf7" }}>
      <svg role="img" aria-label="흐름 그림" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#8a857a" />
          </marker>
          <marker id="arrow-bold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#2c2a26" />
          </marker>
        </defs>
        {edges.map((e) => {
          const key = `${e.from}>${e.to}`;
          const bold = colored.boldEdges.has(key);
          const count = edgeLabels?.get(key);
          return (
            <path key={key} d={e.d} fill="none" stroke={bold ? "#2c2a26" : "#c9c4b8"} strokeWidth={bold ? 2.6 : 1.2}
              markerEnd={`url(#${bold ? "arrow-bold" : "arrow"})`}>
              <title>{`${e.from} → ${e.to}: ${e.when}${count ? ` · ${count}` : ""}`}</title>
            </path>
          );
        })}
        {nodes.map((n) => {
          const look = LOOK[colored.states[n.id]];
          const lines = wrap(n.name);
          const isStart = n.id === colored.activeStart;
          const box = (
            <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
              <title>{`${n.name} (${n.id}) · ${look.label}`}</title>
              <rect width={BOX.w} height={BOX.h} rx={n.type === "branch" ? 28 : 10} fill={look.fill} stroke={n.id === selected ? "#1f4fbf" : look.stroke}
                strokeWidth={isStart || n.id === selected ? 4 : 2} strokeDasharray={n.id === selected ? undefined : look.dash} />
              {lines.map((t, i) => (
                <text key={i} x={BOX.w / 2} y={22 + i * 16} textAnchor="middle" fontSize={13} fontWeight={600} fill="#2c2a26">{t}</text>
              ))}
              <text x={BOX.w / 2} y={BOX.h - 8} textAnchor="middle" fontSize={11} fill="#5b564c">{look.label}</text>
              {n.badge && (
                <g transform={`translate(8 -10)`}>
                  <rect width={labelWidth(n.badge)} height={18} rx={9} fill="#2c2a26" />
                  <text x={7} y={13} fontSize={10.5} fill="#fff">{n.badge}</text>
                </g>
              )}
            </g>
          );
          return nodeHref ? <a key={n.id} href={nodeHref(n.id)} aria-label={`${n.name} 상세 보기`}>{box}</a> : box;
        })}
        {edgeLabels && edges.filter((e) => edgeLabels.has(`${e.from}>${e.to}`)).map((e) => (
          <EdgeLabel key={`label:${e.from}>${e.to}`} r={placeLabel(e, edgeLabels.get(`${e.from}>${e.to}`)!, layout)} text={edgeLabels.get(`${e.from}>${e.to}`)!} />
        ))}
      </svg>
    </div>
  );
}
