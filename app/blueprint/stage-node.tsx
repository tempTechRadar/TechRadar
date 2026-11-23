"use client";
// 단계 노드(P-12e → P-12j H2 컨테이너): 머리는 작게(순서 번호 · 이름 · 기술 수), 몸은 기술 노드(자식 노드, tech-node.tsx)가 놓일 자리.
// 왼쪽 점 = 들어오는 순서 선, 오른쪽 점 = 나가는 순서 선. Library에서 끈 기술(TECH_DRAG)을 놓으면 붙인다.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";
import { STAGE_NAME_MAX } from "@/lib/blueprint/board";
import { BOX, LIMITS, type Stage } from "@/lib/blueprint/graph";
import { TECH_DRAG } from "./studio-types";

export type StageData = {
  stage: Stage; order: number | null; /** 휴대폰 "그림으로 보기": 놓기 · 편집 없음 */ readOnly?: boolean;
  onDropTech: (stageId: string, techId: string) => void;
  /** 위 · 아래 +(S3): 같은 순서에 단계 더하기(읽기 전용이면 없음), 막힌 이유(같은 순서가 가득) */ onBeside?: (stageId: string, dir: -1 | 1) => void; besideBlocked: string | null;
  /** P-12h-2 T1 카드 위 편집(읽기 전용이면 없음): 왼쪽 · 오른쪽 + = 앞 · 다음 단계, 자세히 = 서랍 열기, ✕ = 지우기(토스트 되돌리기) */
  /** hasIn · hasOut = 들어오는 · 나가는 선이 있음(U2: 옆면 +는 그쪽 선이 없을 때만) */
  edit?: { onSide: (stageId: string, dir: -1 | 1) => void; onRemove: (stageId: string) => void; hasIn: boolean; hasOut: boolean;
    /** 메모(T2): 서랍을 열고 메모 칸으로 */ onNote: (stageId: string) => void;
    /** 이름 칸으로 바뀜(두 번 누르기 · F2 · Enter) · 끝(name = null이면 취소) */ editing: boolean; onEdit: (stageId: string) => void; onRename: (stageId: string, name: string | null) => void };
};
export type StageNodeType = Node<StageData, "stage">;

export function StageNode({ data, selected }: NodeProps<StageNodeType>) {
  const { stage } = data;
  const [over, setOver] = useState(false);
  const accepts = (types: readonly string[]) => types.includes(TECH_DRAG);
  // B4: 끄는 동안 어떤 기술인지는 브라우저가 안 알려 줘서(dragover 보호) 확실히 아는 "가득 참"만 미리 막는다. 이미 있는 기술은 놓은 뒤 이유 토스트
  const full = stage.techs.length >= LIMITS.techs;
  return (
    <div className="sn" data-selected={selected ? "" : undefined} data-over={over ? "" : undefined} data-full={over && full ? "" : undefined}
      // 읽기 전용(휴대폰 "그림으로 보기")이면 놓기를 아예 받지 않는다(전에는 판이 바뀔 수 있던 버그)
      onDragOver={(e) => { if (data.readOnly || !accepts(e.dataTransfer.types)) return; e.preventDefault(); e.dataTransfer.dropEffect = full ? "none" : "copy"; setOver(true); }}
      // 단계 안의 칩 위로 지나갈 때도 dragleave가 와서 윤곽이 꺼졌다 켜지며 노드 크기가 흔들리지 않게: 노드 밖으로 나갈 때만 끈다
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setOver(false); }}
      onDrop={(e) => { setOver(false); if (data.readOnly || full) return; const id = e.dataTransfer.getData(TECH_DRAG); if (!id) return; e.preventDefault(); data.onDropTech(stage.id, id); }}>
      <Handle type="target" position={Position.Left} className="sn-handle" isConnectable={!data.readOnly} aria-label={`${stage.name}로 들어오는 선`} />
      {data.onBeside ? ([-1, 1] as const).map((dir) => (
        <button key={dir} type="button" className={`sn-plus nodrag nopan ${dir < 0 ? "sn-plus-up" : "sn-plus-down"}`} aria-disabled={data.besideBlocked ? true : undefined}
          aria-label={`${stage.name} ${dir < 0 ? "위" : "아래"}에 같은 순서 단계 더하기${data.besideBlocked ? ` (못 함: ${data.besideBlocked})` : ""}`} title={data.besideBlocked ?? undefined}
          onClick={() => data.onBeside!(stage.id, dir)}>+</button>
      )) : null}
      {data.edit ? ([-1, 1] as const).filter((dir) => (dir < 0 ? !data.edit!.hasIn : !data.edit!.hasOut)).map((dir) => (
        <button key={`s${dir}`} type="button" className={`sn-plus nodrag nopan ${dir < 0 ? "sn-plus-left" : "sn-plus-right"}`}
          aria-label={`${stage.name} ${dir < 0 ? "앞" : "다음"} 단계 더하기`} onClick={() => data.edit!.onSide(stage.id, dir)}>+</button>
      )) : null}
      <header className="sn-head">
        <span className="sn-order" title="순서(같은 번호는 동시에)">{data.order === null ? "?" : data.order + 1}</span>
        {data.edit?.editing ? <NameInput name={stage.name} onDone={(v) => data.edit!.onRename(stage.id, v)} />
          : <b className="sn-name" onDoubleClick={data.edit ? () => data.edit!.onEdit(stage.id) : undefined} title={data.edit ? "두 번 누르면 이름 바꾸기(F2)" : undefined}>{stage.name}</b>}
        <span className="sn-count">{stage.techs.length}/{LIMITS.techs}</span>
      </header>
      {/* 기술 노드(자식)가 놓일 자리: 높이는 graph.ts stageHeight와 같다. 끄는 동안 다음 자리에 점선 윤곽(B4) */}
      <div className="sn-slots" style={{ height: Math.max(1, stage.techs.length + (over && !full && stage.techs.length ? 1 : 0)) * BOX.row }}>
        {stage.techs.length ? null : <p className="sn-empty">아래에서 기술을 끌어 놓아요</p>}
        {over && !full ? <i className="sn-slot-ghost" aria-hidden="true" style={{ top: stage.techs.length * BOX.row }} /> : null}
      </div>
      {/* 단계 메모(T2): 칩 아래 두 줄로 줄여 옅게. 누르면 서랍 메모 칸. 읽기 전용이면 글만 */}
      {stage.note ? (data.edit ? <button type="button" className="sn-note nodrag nopan" aria-label={`${stage.name} 메모: ${stage.note} (고치기)`} onClick={() => data.edit!.onNote(stage.id)}>{stage.note}</button>
        : <p className="sn-note">{stage.note}</p>) : null}
      {/* U2: 고른 카드(또는 올림 · Tab) 아래 왼쪽 "메모" · 오른쪽 "삭제"(지우고 토스트 되돌리기) */}
      {data.edit && !data.edit.editing ? <div className="sn-actions">
        <button type="button" className="sn-act nodrag nopan" aria-label={`${stage.name} 메모`} onClick={() => data.edit!.onNote(stage.id)}>메모</button>
        <button type="button" className="sn-act nodrag nopan" aria-label={`${stage.name} 단계 삭제`} onClick={() => data.edit!.onRemove(stage.id)}>삭제</button>
      </div> : null}
      {over && full ? <p className="sn-full">가득 참 {stage.techs.length}/{LIMITS.techs}</p> : null}
      <Handle type="source" position={Position.Right} className="sn-handle" isConnectable={!data.readOnly} aria-label={`${stage.name}에서 나가는 선`} />
    </div>
  );
}

/** 카드 위 이름 칸: Enter = 저장, Esc = 취소, 다른 곳 누르기(blur) = 저장. 20자까지. 끝은 한 번만(Enter 뒤 사라지며 오는 blur가 또 돌지 않게) */
function NameInput({ name, onDone }: { name: string; onDone: (v: string | null) => void }) {
  const ended = useRef(false);
  const end = (v: string | null) => { if (ended.current) return; ended.current = true; onDone(v); };
  return (
    <input className="sn-name-input nodrag nopan" defaultValue={name} maxLength={STAGE_NAME_MAX} aria-label="단계 이름" autoFocus onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") end(e.currentTarget.value); if (e.key === "Escape") end(null); }} onBlur={(e) => end(e.currentTarget.value)} />
  );
}
