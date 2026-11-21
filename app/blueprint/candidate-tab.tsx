"use client";
// 하단 패널 "후보" 탭(P-12f ⑤ 보드 녹이기): 옛 보드의 관심 · 적용 후보 · 보류 칸을 청사진 안으로. 계산은 보드와 같음(buildKanban, 서버 candidate-queries).
// 적용 후보만 판에 넣는다(관문): 고른 단계에 "넣기" 또는 끌어서 단계에. 관심 · 보류는 지도에서 적용 후보로 고르면 넣을 수 있다고 안내. 옮기기(판단)는 지도 · 알림에서
import { useEffect, useState } from "react";
import { putTech } from "@/lib/blueprint/graph";
import { putProblem } from "@/lib/blueprint/panel-view";
import { GRADE_KO } from "@/lib/map/build-map";
import type { CandidateBoard } from "@/lib/server/candidate-queries";
import type { Card } from "@/lib/views/kanban";
import { candidatesAction } from "./candidate-actions";
import { TECH_DRAG, type PanelProps } from "./studio-types";
import { TechChip } from "./tech-chip";

const COLS: [keyof CandidateBoard, string, string][] = [
  ["candidate", "적용 후보", "판에 넣을 수 있어요."],
  ["interest", "관심", "지도에서 적용 후보로 고르면 넣을 수 있어요."],
  ["hold", "보류", "보류한 이유와 함께 남아 있어요."],
];
const mapLink = (id: string) => `/?sel=${encodeURIComponent(`tech:${id}`)}`;

export function CandidateTab({ graph, picked, apply, pool, say }: PanelProps) {
  const [board, setBoard] = useState<CandidateBoard | { message: string } | undefined>(undefined); // undefined = 읽는 중
  useEffect(() => { candidatesAction().then(setBoard, () => setBoard({ message: "후보를 불러오지 못했어요. 없다는 뜻이 아니에요." })); }, []);
  const stage = picked ? graph.stages.find((s) => s.id === picked.stageId) ?? null : null;
  const put = (c: Card) => {
    if (!stage || !c.techId) return;
    const why = putProblem(stage, { id: c.techId, grade: c.grade });
    if (why) { say(why); return; }
    apply(putTech(graph, stage.id, { id: c.techId, name: c.name }), `${stage.name}에 ${c.name}을(를) 넣었어요.`);
  };
  if (board === undefined) return <p className="muted" role="status">후보를 읽는 중…</p>;
  if ("message" in board) return <p className="notice notice-error" role="alert">{board.message}</p>;
  return (
    <>
      <p className="muted">{stage ? <><b>{stage.name}</b> 단계에 넣을 적용 후보를 고르세요.</> : "캔버스에서 단계를 고르면 적용 후보에 \"넣기\"가 생겨요. 끌어서 단계에 놓아도 돼요."}</p>
      <div className="dock-cols dock-cols-3">{COLS.map(([k, title, hint]) => (
        <section key={k} aria-labelledby={`cand-${k}`}>
          <h3 id={`cand-${k}`} className="dock-h">{title} <span className="muted">{board[k].length}</span></h3>
          <p className="muted">{hint}</p>
          {board[k].length ? <ul className="dock-techs">{board[k].map((c) => {
            const can = k === "candidate" && c.techId && c.grade !== "danger";
            const placed = Boolean(stage && c.techId && stage.techs.some((t) => t.id === c.techId));
            return (
              <li key={c.key} className="dock-tech" draggable={Boolean(can)} onDragStart={(e) => { if (!can) return; e.dataTransfer.setData(TECH_DRAG, c.techId!); e.dataTransfer.effectAllowed = "copy"; }}>
                <span className="dock-chip"><TechChip tech={{ id: c.techId ?? c.key, name: c.name }} info={pool.find((t) => t.id === c.techId)} />
                  {c.grade !== "pass" ? <span className={`dock-grade g-${c.grade}`}>{GRADE_KO[c.grade]}</span> : null}</span>
                {c.note ? <span className="muted">{k === "hold" ? `이유: ${c.note}` : c.note}</span> : null}
                {c.from === "alert" ? <span className="muted">알림에서 판단함</span> : null}
                <span className="dock-row">
                  {c.grade === "danger" && k === "candidate" ? <span className="dock-risky">✕ 위험 등급이라 넣지 않아요</span>
                    : can && placed ? <span className="muted">✓ {stage!.name}에 있어요</span>
                    : can && stage ? <button type="button" className="btn dock-sm" onClick={() => put(c)}>{stage.name}에 넣기</button> : null}
                  {c.techId ? <a className="dock-link" href={mapLink(c.techId)}>지도에서 보기</a> : null}
                </span>
              </li>
            );
          })}</ul> : <p className="muted">없어요.</p>}
        </section>
      ))}</div>
    </>
  );
}
