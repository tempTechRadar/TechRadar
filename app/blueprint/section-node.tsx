"use client";
// 섹션 틀(P-12o 2단계): 묶은 단계들을 감싸는 점선 틀. 머리에 이름 · 공통 기술 칩 · [풀기], 머리에 기술을 끌어 놓으면 공통 기술(안의 단계들이 공유).
// 틀 몸은 눌림을 받지 않아(pointer-events: none) 안의 단계를 그대로 고르고 끈다. 자리 · 크기는 안의 단계에서 계산한다(studio.tsx)
import type { Node, NodeProps } from "@xyflow/react";
import { useState } from "react";
import type { Section } from "@/lib/blueprint/sections";
import { TECH_DRAG } from "./studio-types";

export type SectionData = {
  section: Section; readOnly?: boolean;
  onDropTech: (sectionId: string, techId: string) => void; onRemoveTech: (sectionId: string, techId: string) => void; onUngroup: (sectionId: string) => void;
};
export type SectionNodeType = Node<SectionData, "section">;

export function SectionNode({ data }: NodeProps<SectionNodeType>) {
  const { section: s, readOnly } = data;
  const [over, setOver] = useState(false);
  return (
    <div className="secn" data-over={over ? "" : undefined} role="group" aria-label={`섹션 ${s.name}, 단계 ${s.stageIds.length}개, 공통 기술 ${s.techs.length}개`}>
      <header className="secn-head nodrag nopan"
        onDragOver={(e) => { if (readOnly || !e.dataTransfer.types.includes(TECH_DRAG)) return; e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setOver(false); }}
        onDrop={(e) => { setOver(false); if (readOnly) return; const id = e.dataTransfer.getData(TECH_DRAG); if (!id) return; e.preventDefault(); data.onDropTech(s.id, id); }}>
        <b className="secn-name">{s.name}</b>
        <span className="secn-techs">
          {s.techs.length ? s.techs.map((t) => (
            <span key={t.id} className="nchip" data-c="teal">{t.name}{readOnly ? null : <button type="button" className="secn-x" aria-label={`${s.name} 섹션 공통 기술 ${t.name} 빼기`} onClick={() => data.onRemoveTech(s.id, t.id)}>✕</button>}</span>
          )) : <span className="muted">{readOnly ? "공통 기술 없음" : "기술을 여기로 끌어 놓으면 공통 기술"}</span>}
        </span>
        {readOnly ? null : <button type="button" className="secn-ungroup" onClick={() => data.onUngroup(s.id)}>풀기</button>}
      </header>
    </div>
  );
}
