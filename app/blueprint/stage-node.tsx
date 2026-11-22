"use client";
// 단계 노드(P-12e): 머리는 작게(순서 번호 · 이름 · 기술 수), 몸은 기술 칩. 왼쪽 점 = 들어오는 선, 오른쪽 점 = 나가는 선.
// 하단 패널에서 끈 기술(TECH_DRAG)을 놓으면 붙인다. ① 단계 구축에서는 칩을 흐리게(단계 설계에 집중), ② 스킬 붙이기에서만 칩 빼기.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { LIMITS, type Stage } from "@/lib/blueprint/graph";
import type { PoolTech } from "@/lib/server/blueprints";
import { TECH_DRAG, type Picked, type Step } from "./studio-types";
import { TechChip } from "./tech-chip";

export type StageData = {
  stage: Stage; order: number | null; step: Step; picked: Picked; info: Map<string, PoolTech>; /** 휴대폰 "그림으로 보기": 칩 고르기 · 빼기 없음 */ readOnly?: boolean;
  onPick: (p: Picked) => void; onDropTech: (stageId: string, techId: string) => void; onRemoveTech: (stageId: string, techId: string) => void;
  /** 관문 밖 기술(info에 없음)을 적용 후보로 고르기 · 지금 고르는 중인 기술 id */ onCandidate: (techId: string, name: string) => void; marking: string | null;
};
export type StageNodeType = Node<StageData, "stage">;

export function StageNode({ data, selected }: NodeProps<StageNodeType>) {
  const { stage, step, picked } = data;
  const [over, setOver] = useState(false);
  const accepts = (types: readonly string[]) => types.includes(TECH_DRAG);
  // B4: 끄는 동안 어떤 기술인지는 브라우저가 안 알려 줘서(dragover 보호) 확실히 아는 "가득 참"만 미리 막는다. 이미 있는 기술은 놓은 뒤 이유 토스트
  const full = stage.techs.length >= LIMITS.techs;
  // 노드가 처음 그려진 뒤에 붙은 칩만 톡 나온다(페이지 열기 · 템플릿 · 이력 불러오기 때는 안 돎)
  const born = useRef(false);
  useEffect(() => { born.current = true; }, []);
  return (
    <div className="sn" data-selected={selected ? "" : undefined} data-step={step} data-over={over ? "" : undefined} data-full={over && full ? "" : undefined}
      // 읽기 전용(휴대폰 "그림으로 보기")이면 놓기를 아예 받지 않는다(전에는 판이 바뀔 수 있던 버그)
      onDragOver={(e) => { if (data.readOnly || !accepts(e.dataTransfer.types)) return; e.preventDefault(); e.dataTransfer.dropEffect = full ? "none" : "copy"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); if (data.readOnly || full) return; const id = e.dataTransfer.getData(TECH_DRAG); if (!id) return; e.preventDefault(); data.onDropTech(stage.id, id); }}>
      <Handle type="target" position={Position.Left} className="sn-handle" isConnectable={!data.readOnly} aria-label={`${stage.name}로 들어오는 선`} />
      <header className="sn-head">
        <span className="sn-order" title="순서(같은 번호는 동시에)">{data.order === null ? "?" : data.order + 1}</span>
        <b className="sn-name">{stage.name}</b>
        <span className="sn-count">{stage.techs.length}/{LIMITS.techs}</span>
      </header>
      {stage.techs.length ? (
        <div className="sn-techs">
          {stage.techs.map((t) => (
            <TechChip key={t.id} tech={t} info={data.info.get(t.id)} fresh={born.current}
              picked={picked?.kind === "tech" && picked.stageId === stage.id && picked.techId === t.id}
              onPick={data.readOnly ? undefined : () => data.onPick({ kind: "tech", stageId: stage.id, techId: t.id })}
              onCandidate={data.info.has(t.id) || data.readOnly ? undefined : () => data.onCandidate(t.id, t.name)} busy={data.marking === t.id}
              onRemove={(step === 2 || !data.info.has(t.id)) && !data.readOnly ? () => data.onRemoveTech(stage.id, t.id) : undefined} />
          ))}
        </div>
      ) : <p className="sn-empty">{step === 2 ? "아래에서 기술을 끌어 놓아요" : "아직 기술 없음"}</p>}
      {over && full ? <p className="sn-full">가득 참 {stage.techs.length}/{LIMITS.techs}</p> : null}
      <Handle type="source" position={Position.Right} className="sn-handle" isConnectable={!data.readOnly} aria-label={`${stage.name}에서 나가는 선`} />
    </div>
  );
}
