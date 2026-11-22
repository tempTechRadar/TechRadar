"use client";
// 순서 선(P-12h S3): 기본 곡선 그대로(BaseEdge + getBezierPath, 넓은 누름 영역 interactionWidth 유지 → 확정 선 긋기 se-draw가 그대로 돈다)
// + 마우스를 올리면(또는 선을 고르면) 가운데 "끊기" 단추. 키보드는 속성 패널 앞 · 다음 단계 줄의 "끊기"
import { BaseEdge, EdgeToolbar, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";

/** onCut 없음 = 읽기 전용(단추 없음). onKeep · onLeave = 선에서 단추로 옮기는 틈에 단추가 사라지지 않게(studio가 150ms 지킴) */
export type SeqData = { label: string; hover: boolean; onCut?: () => void; onKeep: () => void; onLeave: () => void };
export type SeqEdgeType = Edge<SeqData, "seq">;

export function SeqEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, interactionWidth, data, selected }: EdgeProps<SeqEdgeType>) {
  const [path, x, y] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
      {data?.onCut ? (
        <EdgeToolbar edgeId={id} x={x} y={y} isVisible={data.hover || Boolean(selected)}>{/* 고른 선에도(터치는 마우스 올리기가 없어 눌러 고르면 보임) */}
          <button type="button" className="se-cut nodrag nopan" aria-label={`${data.label} 연결 끊기`} onMouseEnter={data.onKeep} onMouseLeave={data.onLeave} onClick={(e) => { e.stopPropagation(); data.onCut!(); }}>✕ 끊기</button>{/* 누름이 캔버스 빈 곳(onPaneClick = 고른 것 풀기)까지 올라가지 않게 */}
        </EdgeToolbar>
      ) : null}
    </>
  );
}
