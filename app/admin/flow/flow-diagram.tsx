// 흐름 그림(SVG). 색은 colorize()가 실제 기록에서 정한 값만 쓴다(불변 6). 색만으로 구분하지 않게 글자로도 적는다.
// 접근성(PRD-NF5): 상자 링크는 이름과 상태를 읽어 주고, 키보드 초점이 보이며, 그림 아래 "그림을 글로 보기"로 상태·화살표 건수를 글로 준다.
import { LABEL_H, labelWidth, placeLabel, type Rect } from "@/lib/flow/edge-label";
import { BOX, layoutFlow } from "@/lib/flow/layout";
import { FLOW_INK, LOOK } from "@/lib/flow/look";
import { pathFrom, type Colored, type NodeState } from "@/lib/flow/status";
import { flowTextAlt } from "@/lib/flow/text-alt";
import type { Flow } from "@/lib/flow/types";

// SVG 안의 링크는 브라우저 기본 초점 테두리가 잘 안 보여서 상자 테두리를 굵고 파랗게 바꾼다
const FOCUS_CSS = `a.flow-node:focus { outline: none; } a.flow-node:focus-visible > g > rect:first-of-type { stroke: ${FLOW_INK.focus}; stroke-width: 5; stroke-dasharray: none; }`;


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
          <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, background: LOOK[s].fill, border: `2px ${LOOK[s].dash ? "dashed" : "solid"} ${LOOK[s].stroke}` }} />
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
  /** 상자를 누르면 갈 주소(상세 보기). id가 없으면 아무것도 안 고른 주소. 없으면 누를 수 없다 */
  nodeHref?: (id: string | undefined) => string;
  /** 고른 상자. 시작 상자면 그 시작에서 갈 수 있는 길(flow.json 연결)을 파란 점선으로 따로 보인다 */
  selected?: string;
};

/** 자리(r)는 placeLabel이 상자와 겹치지 않게 고른다 */
function EdgeLabel({ r, text }: { r: Rect; text: string }) {
  return (
    <g transform={`translate(${r.x} ${r.y})`} aria-hidden="true">
      <rect width={r.w} height={LABEL_H} rx={LABEL_H / 2} fill="#fff" stroke="#8a857a" />
      <text x={r.w / 2} y={13} textAnchor="middle" fontSize={11} fontWeight={600} fill={FLOW_INK.name}>{text}</text>
    </g>
  );
}

/** 그림을 못 보는 사람용: 켜진 상자의 상태와 지나간·건수 있는 화살표(lib/flow/text-alt) */
function FlowText({ flow, colored, edgeLabels }: { flow: Flow; colored: Colored; edgeLabels?: Map<string, string> }) {
  const alt = flowTextAlt(flow, colored, edgeLabels ?? new Map());
  return (
    <details style={{ margin: "8px 0" }}>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>그림을 글로 보기</summary>
      {alt.boxes.length === 0 ? <p>이번 실행에서 켜진 상자가 없어요(상자 {alt.offCount}개 모두 안 켜짐).</p> : (
        <>
          <h3 style={{ fontSize: 16 }}>켜진 상자 {alt.boxes.length}개 <span style={{ fontWeight: 400 }}>(안 켜진 상자 {alt.offCount}개)</span></h3>
          <ul>{alt.boxes.map((b) => <li key={b}>{b}</li>)}</ul>
          <h3 style={{ fontSize: 16 }}>지나간 화살표와 건수</h3>
          {alt.arrows.length === 0 ? <p>없어요.</p> : <ul>{alt.arrows.map((a) => <li key={a}>{a}</li>)}</ul>}
        </>
      )}
    </details>
  );
}

/** 길 보기를 글로: 설계도에서 갈 수 있는 길이라 실행 기록과 따로 적는다 */
function PathText({ flow, start, edges }: { flow: Flow; start: string; edges: Set<string> }) {
  const name = (id: string) => flow.nodes.find((n) => n.id === id)?.name ?? id;
  return (
    <div style={{ fontSize: 14, margin: "8px 0" }}>
      <p style={{ margin: 0 }}><strong>{start}</strong>에서 갈 수 있는 길을 파란 점선으로 보여요(설계도 기준, 이번 실행의 기록이 아니에요). 이 시작 상자를 다시 누르면 길 보기가 풀려요.</p>
      <details>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>길의 화살표 {edges.size}개 글로 보기</summary>
        <ul>{[...edges].map((k) => { const [a, b] = k.split(">"); return <li key={k}>{name(a)} → {name(b)}</li>; })}</ul>
      </details>
    </div>
  );
}

export function FlowDiagram({ flow, colored, edgeLabels, nodeHref, selected }: DiagramProps) {
  const layout = layoutFlow(flow);
  const pathStart = flow.nodes.find((n) => n.id === selected && n.type === "start");
  // 길은 설계도(flow.json)이지 실행 기록이 아니다: 실행의 굵은 선·색과 섞이지 않게 파란 점선으로 따로 그린다(불변 6)
  const path = pathStart ? pathFrom(flow, pathStart.id) : null;
  const { nodes, edges, width, height } = layout;
  // 링크를 품으면 role="img"로 두면 안 된다(안의 링크가 읽히지 않음). 누를 수 있으면 묶음(group)으로 둔다.
  const svgRole = nodeHref ? { role: "group", "aria-label": "흐름 그림: 상자를 누르면 상세가 열려요" } : { role: "img", "aria-label": "흐름 그림(아래 '그림을 글로 보기'에 같은 내용)" };
  return (
    <>
    <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 12, background: FLOW_INK.canvas }}>
      <svg {...svgRole} width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
        <style>{FOCUS_CSS}</style>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#8a857a" />
          </marker>
          <marker id="arrow-path" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill={FLOW_INK.focus} />
          </marker>
          <marker id="arrow-bold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#2c2a26" />
          </marker>
        </defs>
        {edges.map((e) => {
          const key = `${e.from}>${e.to}`;
          const bold = colored.boldEdges.has(key);
          const onPath = path?.edges.has(key);
          const count = edgeLabels?.get(key);
          return (
            <path key={key} d={e.d} fill="none" stroke={onPath ? FLOW_INK.focus : bold ? "#2c2a26" : "#c9c4b8"} strokeWidth={onPath || bold ? 2.6 : 1.2}
              strokeDasharray={onPath ? "7 4" : undefined} markerEnd={`url(#${onPath ? "arrow-path" : bold ? "arrow-bold" : "arrow"})`}>
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
              {path?.nodes.has(n.id) && <rect x={-5} y={-5} width={BOX.w + 10} height={BOX.h + 10} rx={14} fill="none" stroke={FLOW_INK.focus} strokeWidth={2} strokeDasharray="7 4" aria-hidden="true" />}
              <title>{`${n.name} (${n.id}) · ${look.label}`}</title>
              <rect width={BOX.w} height={BOX.h} rx={n.type === "branch" ? 28 : 10} fill={look.fill} stroke={n.id === selected ? "#1f4fbf" : look.stroke}
                strokeWidth={isStart || n.id === selected ? 4 : 2} strokeDasharray={n.id === selected ? undefined : look.dash} />
              {lines.map((t, i) => (
                <text key={i} x={BOX.w / 2} y={22 + i * 16} textAnchor="middle" fontSize={13} fontWeight={600} fill={FLOW_INK.name}>{t}</text>
              ))}
              <text x={BOX.w / 2} y={BOX.h - 8} textAnchor="middle" fontSize={11} fill={FLOW_INK.state}>{look.label}</text>
              {n.badge && (
                <g transform={`translate(8 -10)`}>
                  <rect width={labelWidth(n.badge)} height={18} rx={9} fill={FLOW_INK.badgeBg} />
                  <text x={7} y={13} fontSize={10.5} fill="#fff">{n.badge}</text>
                </g>
              )}
            </g>
          );
          return nodeHref ? (
            <a key={n.id} className="flow-node" href={nodeHref(n.id === selected ? undefined : n.id)} aria-label={`${n.name}: ${look.label}${n.id === selected ? " (보는 중)" : ""}. ${n.id === selected ? (n.type === "start" ? "다시 누르면 길 보기와 상세를 닫아요" : "다시 누르면 상세를 닫아요") : n.type === "start" ? "이 시작에서 갈 수 있는 길과 상세 보기" : "상세 보기"}`} aria-current={n.id === selected ? "true" : undefined}>{box}</a>
          ) : box;
        })}
        {edgeLabels && edges.filter((e) => edgeLabels.has(`${e.from}>${e.to}`)).map((e) => (
          <EdgeLabel key={`label:${e.from}>${e.to}`} r={placeLabel(e, edgeLabels.get(`${e.from}>${e.to}`)!, layout)} text={edgeLabels.get(`${e.from}>${e.to}`)!} />
        ))}
      </svg>
    </div>
    {pathStart && path && <PathText flow={flow} start={pathStart.name} edges={path.edges} />}
    <FlowText flow={flow} colored={colored} edgeLabels={edgeLabels} />
    </>
  );
}
