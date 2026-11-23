"use client";
// 끄는 동안 도움(P-12e 조각 E, 피그마 · X-MIND식): 단계 하나를 끌면 8px 격자와 다른 단계의 가장자리 · 가운데에 붙는다(보조선). 여러 개를 끌면 격자에만 붙는다.
// 가까이 놓으면 저절로 잇던 것은 지웠다(P-12s 사용자 "근처에 두면 무조건 이어지는 거 너무 불편해"): 잇기는 점에서 선을 끌 때만.
// 잡은 자리(커서와 노드의 거리)는 React Flow가 끄는 동안 지켜 준다: 붙은 위치를 돌려줘도 다음 움직임은 포인터 기준으로 다시 잰다.
import { useState } from "react";
import { useReactFlow, ViewportPortal } from "@xyflow/react";
import { GRID, moveStages, NODE_SIZE, snap, type Graph, type Guide, type Pos, type Size } from "@/lib/blueprint/graph";

const onGrid = (p: Pos): Pos => ({ x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID });

export function useDragAssist() {
  const flow = useReactFlow();
  const [guides, setGuides] = useState<Guide[]>([]);
  const sizeOf = (s: { id: string }): Size => { const m = flow.getInternalNode(s.id)?.measured; return m?.width && m?.height ? { w: m.width, h: m.height } : NODE_SIZE; };

  /** raw = 이번 움직임의 포인터 기준 위치. 돌려주는 값 = 붙인 위치 */
  function during(g: Graph, raw: Map<string, Pos>): Map<string, Pos> {
    if (raw.size !== 1) { setGuides([]); return new Map([...raw].map(([id, p]) => [id, onGrid(p)])); }
    const [[id, p]] = [...raw];
    const others = g.stages.filter((s) => s.id !== id).map((s) => ({ x: s.x, y: s.y, ...sizeOf(s) }));
    const sn = snap({ ...p, ...sizeOf({ id }) }, others);
    const at = new Map([[id, { x: sn.x, y: sn.y }]]);
    setGuides(sn.guides);
    return at;
  }
  /** 놓을 때: 옮기기만 한다(되돌리기 한 칸) */
  function drop(g: Graph, at: Map<string, Pos> | null): Graph {
    setGuides([]);
    return at?.size ? moveStages(g, at) : g;
  }
  return { guides, during, drop };
}

/** 보조선: 캔버스 좌표로 그리는 1px 선(확대 · 이동을 따라감) */
export function GuideLines({ guides }: { guides: Guide[] }) {
  return (
    <ViewportPortal>
      {guides.map((gd) => (
        <div key={`${gd.axis}${gd.at}`} className={`sg sg-${gd.axis}`} aria-hidden="true"
          style={{ transform: gd.axis === "x" ? `translate(${gd.at}px, -50000px)` : `translate(-50000px, ${gd.at}px)` }} />
      ))}
    </ViewportPortal>
  );
}
