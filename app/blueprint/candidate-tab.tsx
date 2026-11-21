"use client";
// 하단 패널 "후보" 탭(P-12f ⑤ 보드 녹이기): 옛 보드의 관심 · 적용 후보 · 보류 칸을 청사진 안으로. 계산은 보드와 같음(buildKanban, 서버 candidate-queries).
// 적용 후보만 판에 넣는다(관문): 고른 단계에 "넣기" 또는 끌어서 단계에. 서랍(pool)에 아직 없는 후보는 끌기와 같게 막는다(화면을 새로 고치면 들어옴).
// 관심 · 보류는 지도에서 적용 후보로 고르면 넣을 수 있다고 안내. 옮기기(판단)는 지도 · 알림에서
import Link from "next/link";
import { useEffect, useState } from "react";
import { putTech, type Stage } from "@/lib/blueprint/graph";
import { putProblem } from "@/lib/blueprint/panel-view";
import { GRADE_KO } from "@/lib/map/build-map";
import type { CandidateBoard } from "@/lib/server/candidate-queries";
import type { PoolTech } from "@/lib/server/blueprints";
import type { Card } from "@/lib/views/kanban";
import { candidatesAction, type CandidateRead } from "./candidate-actions";
import { TECH_DRAG, type PanelProps } from "./studio-types";
import { TechChip } from "./tech-chip";

type Col = keyof CandidateBoard;
const COLS: [Col, string, string][] = [
  ["candidate", "적용 후보", "판에 넣을 수 있어요."],
  ["interest", "관심", "지도에서 적용 후보로 고르면 넣을 수 있어요."],
  ["hold", "보류", "보류한 이유와 함께 남아 있어요."],
];

export function CandidateTab({ graph, picked, apply, pool, say }: PanelProps) {
  const [read, setRead] = useState<CandidateRead | undefined>(undefined); // undefined = 읽는 중
  useEffect(() => { candidatesAction().then(setRead, () => setRead({ kind: "error", message: "후보를 불러오지 못했어요. 없다는 뜻이 아니에요." })); }, []);
  const stage = picked ? graph.stages.find((s) => s.id === picked.stageId) ?? null : null;
  const put = (c: Card) => {
    if (!stage || !c.techId) return;
    const why = putProblem(stage, { id: c.techId, grade: c.grade });
    if (why) { say(why); return; }
    apply(putTech(graph, stage.id, { id: c.techId, name: c.name }), `${stage.name}에 ${c.name}을(를) 넣었어요.`);
  };
  if (read === undefined) return <p className="muted" role="status">후보를 읽는 중…</p>;
  if (read.kind === "login") return <p className="notice notice-empty">로그인하면 내 관심 · 적용 후보 · 보류가 여기에 모여요. <Link href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</Link></p>;
  if (read.kind === "error") return <p className="notice notice-error" role="alert">{read.message}</p>;
  return (
    <>
      <p className="muted">{stage ? <><b>{stage.name}</b> 단계에 넣을 적용 후보를 고르세요.</> : "캔버스에서 단계를 고르면 적용 후보에 \"넣기\"가 생겨요. 끌어서 단계에 놓아도 돼요."}</p>
      <div className="dock-cols dock-cols-3">{COLS.map(([k, title, hint]) => (
        <section key={k} aria-labelledby={`cand-${k}`}>
          <h3 id={`cand-${k}`} className="dock-h">{title} <span className="muted">{read.board[k].length}</span></h3>
          <p className="muted">{hint}</p>
          {read.board[k].length ? <ul className="dock-techs">{read.board[k].map((c) => <CandidateCard key={c.key} c={c} col={k} stage={stage} info={pool.find((t) => t.id === c.techId)} onPut={() => put(c)} />)}</ul>
            : <p className="muted">없어요.</p>}
        </section>
      ))}</div>
    </>
  );
}

/** 카드 한 장. 넣을 수 있음 = 적용 후보 칸 · 위험 아님 · 서랍에 있음(끌어 놓기 검사와 같게) */
function CandidateCard({ c, col, stage, info, onPut }: { c: Card; col: Col; stage: Stage | null; info?: PoolTech; onPut: () => void }) {
  const can = col === "candidate" && Boolean(c.techId) && c.grade !== "danger" && Boolean(info);
  const placed = Boolean(stage && c.techId && stage.techs.some((t) => t.id === c.techId));
  const action = col !== "candidate" ? null
    : c.grade === "danger" ? <span className="dock-risky">✕ 위험 등급이라 넣지 않아요</span>
    : !info ? <span className="muted">방금 고른 후보예요. 화면을 새로 고치면 넣을 수 있어요.</span>
    : placed ? <span className="muted">✓ {stage!.name}에 있어요</span>
    : stage ? <button type="button" className="btn dock-sm" onClick={onPut}>{stage.name}에 넣기</button> : null;
  return (
    <li className="dock-tech" draggable={can} onDragStart={(e) => { if (!can) return; e.dataTransfer.setData(TECH_DRAG, c.techId!); e.dataTransfer.effectAllowed = "copy"; }}>
      <span className="dock-chip"><TechChip tech={{ id: c.techId ?? c.key, name: c.name }} info={info} />
        {c.grade !== "pass" ? <span className={`dock-grade g-${c.grade}`}>{GRADE_KO[c.grade]}</span> : null}</span>
      {c.note ? <span className="muted">{col === "hold" ? `이유: ${c.note}` : c.note}</span> : null}
      {c.from === "alert" ? <span className="muted">알림에서 판단함</span> : null}
      <span className="dock-row">
        {action}
        {c.techId ? <a className="dock-link" href={`/?sel=${encodeURIComponent(`tech:${c.techId}`)}`}>지도에서 보기</a> : null}
      </span>
    </li>
  );
}
