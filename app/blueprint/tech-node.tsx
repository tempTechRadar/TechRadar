"use client";
// 기술 노드(P-12j H2): 단계(컨테이너) 안 자식 노드. 칩(TechChip: 종류 글자 · 이름 · 등급 점, 후보는 점선 + 담기)에 종류 라벨을 붙인다.
// 왼쪽 · 오른쪽 점 = 기술 관계선(사용자 표시, "검증 · 호환"이 아님). 색은 상태(등급 점 · 후보 점선)에만.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { BlueprintTech } from "@/lib/blueprint/graph";
import type { PoolTech } from "@/lib/server/blueprints";
import { TechChip, TYPE_KO } from "./tech-chip";

export type TechData = {
  tech: BlueprintTech; info?: PoolTech; picked: boolean; fresh: boolean; readOnly: boolean; busy: boolean;
  onPick: () => void; onRemove: () => void; onCandidate?: () => void; /** 두 번 누르기 = 기술 상세(H3) */ onOpen?: () => void;
};
export type TechNodeType = Node<TechData, "tech">;

export function TechNode({ data }: NodeProps<TechNodeType>) {
  const { tech, info, readOnly } = data, type = info?.type ?? "";
  return (
    <div className="tn" onDoubleClick={readOnly ? undefined : data.onOpen} title={readOnly ? undefined : "두 번 누르면 기술 상세"}>
      <Handle type="target" position={Position.Left} className="tn-handle" isConnectable={!readOnly} aria-label={`${tech.name}로 오는 관계 표시`} />
      <TechChip tech={tech} info={info} fresh={data.fresh} picked={data.picked} busy={data.busy} drag
        onPick={readOnly ? undefined : data.onPick} onRemove={readOnly ? undefined : data.onRemove} onCandidate={readOnly ? undefined : data.onCandidate} />
      {type ? <span className="tn-kind" aria-hidden="true">{TYPE_KO[type] ?? type}</span> : null}
      <Handle type="source" position={Position.Right} className="tn-handle" isConnectable={!readOnly} aria-label={`${tech.name}에서 나가는 관계 표시`} />
    </div>
  );
}
