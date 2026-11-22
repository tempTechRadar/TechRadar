"use client";
// 청사진 스튜디오 목록 모드(P-12e 조각 K): 휴대폰(860px 이하) · 키보드 · 화면 읽기용 편집. 캔버스는 보기만, 편집은 여기서.
// 단계를 순서(연결선의 깊이)대로 카드로: 단계 더하기 · 이름 · 앞 단계 잇기 / 끊기 · 기술 넣기 / 빼기 · 지우기. 끌기 없이 고르기 칸과 단추만.
// 그래프는 graph.ts 편집 함수 → apply로만 바꾼다(캔버스와 같은 상태, 되돌리기 · 저장은 studio).
import { useMemo, useRef, useState } from "react";
import { STAGE_NAME_MAX } from "@/lib/blueprint/board";
import { addStage, connect, connectProblem, createStage, disconnect, putTech, removeStage, removeTech, renameStage, type Graph, type Stage } from "@/lib/blueprint/graph";
import { fitsStage } from "@/lib/blueprint/knowledge";
import { CONNECT_KO, addStageAfter, addStageBeside, linkSaid, listRows, nameProblem, neighbors, parallelProblem, putProblem, putSaid, removeSaid } from "@/lib/blueprint/panel-view";
import type { PanelProps } from "./studio-types";
import { StageChips } from "./stage-chips";
import "./list-mode.css";

export function ListMode(p: PanelProps) {
  const { rows, cycle } = listRows(p.graph);
  const canFrom = useMemo(() => fromOptions(p.graph), [p.graph]);
  const nameOf = new Map(p.graph.stages.map((s) => [s.id, s.name]));
  return (
    <section className="lm" aria-labelledby="lm-title">
      <h2 id="lm-title" tabIndex={-1}>목록으로 고치기</h2>
      <p className="muted">캔버스와 같은 판이에요. 여기서 바꾸면 캔버스에도 바로 보여요. 순서는 &quot;앞 단계&quot;로 정해요.</p>
      {cycle ? <p className="notice notice-error" role="alert">순서가 돌고 도는 연결이 있어요({cycle.map((id) => nameOf.get(id) ?? id).join(" → ")}). 앞 단계 하나를 끊어 주세요. 이대로는 확정할 수 없어요.</p> : null}
      {rows.length ? (
        <ol className="lm-rows">{rows.map((row, i) => (
          <li key={i}>{/* 순서 번호로: 같은 순서에 단계를 더해도 줄이 새로 그려지지 않아 누른 단추의 초점이 남는다 */}
            <h3 className="lm-step">{cycle ? `${i + 1}번째(순서 모름)` : `${i + 1}번째`}{row.length > 1 ? ` · 동시에 ${row.length}개` : ""}</h3>
            <ul className="lm-cards">{row.map((s) => <StageCard key={`${s.id}:${s.name}`} {...p} s={s} canFrom={canFrom.get(s.id) ?? []} />)}{/* 이름이 다른 곳(속성 패널)에서 바뀌면 이름 칸을 새로 */}</ul>
          </li>
        ))}</ol>
      ) : <p className="muted">아직 단계가 없어요. 아래에서 첫 단계를 더해 보세요.</p>}
      <AddStage {...p} />
    </section>
  );
}

/** 단계마다 앞 단계로 이을 수 있는 단계(고리 · 겹침 · 한도면 빠짐). 판이 바뀔 때 한 번만 */
const fromOptions = (g: Graph) => new Map(g.stages.map((s) => [s.id, g.stages.filter((x) => connectProblem(g, x.id, s.id) === null)]));

/** 캔버스 "＋ 단계"와 같은 규칙(addStageAfter): 고른 단계가 있으면 그 다음에 이어 붙이고 새 단계를 고른 채로 */
function AddStage({ graph, apply, say, picked, onPick }: PanelProps) {
  const [name, setName] = useState("");
  const after = picked ? graph.stages.find((s) => s.id === picked.stageId) : undefined;
  const add = () => {
    const r = addStageAfter(graph, name, after);
    if ("problem" in r) { say(r.problem); return; }
    apply(r.graph, after && r.linked ? `"${after.name}" 다음에 "${r.stage.name}" 단계를 더하고 이었어요.` : `"${r.stage.name}" 단계를 더했어요. 앞 단계를 골라 순서를 이어 주세요.`);
    onPick({ kind: "stage", stageId: r.stage.id });
    setName("");
  };
  return (
    <form className="lm-row lm-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <label>{after ? `"${after.name}" 다음 단계 이름` : "새 단계 이름"} <input value={name} onChange={(e) => setName(e.target.value)} maxLength={STAGE_NAME_MAX} placeholder="예: 기획, 개발, 테스트" /></label>
      <button type="submit" className="btn btn-primary btn-sm">단계 더하기</button>
    </form>
  );
}

function StageCard({ graph, apply, pool, picked, onPick, say, onCandidate, marking, s, canFrom }: PanelProps & { s: Stage; canFrom: Stage[] }) {
  const [from, setFrom] = useState("");
  const [tech, setTech] = useState("");
  const [name, setName] = useState(s.name);
  const { before } = neighbors(graph, s.id);
  const canPut = pool.filter((t) => t.grade !== "danger" && fitsStage(s.name, t) && !s.techs.some((x) => x.id === t.id));
  const card = useRef<HTMLLIElement>(null);
  const stay = () => card.current?.querySelector<HTMLElement>(".lm-name")?.focus(); // 뺀 칩 · 끊은 단추가 사라져도 초점은 이 카드에
  const chosenStage = picked?.stageId === s.id;
  const chosen = chosenStage && picked?.kind === "stage";
  const link = () => {
    if (!from) { say("이을 앞 단계를 먼저 골라 주세요."); return; }
    const why = connectProblem(graph, from, s.id);
    if (why) { say(CONNECT_KO[why]); return; }
    apply(connect(graph, from, s.id), linkSaid(graph, from, s.id, false));
    setFrom("");
  };
  const put = () => {
    const t = pool.find((x) => x.id === tech);
    if (!t) { say("넣을 기술을 먼저 골라 주세요."); return; }
    const why = putProblem(s, t);
    if (why) { say(why); return; }
    apply(putTech(graph, s.id, { id: t.id, name: t.name }), putSaid(s.name, t.name));
    setTech("");
  };
  const rename = () => {
    const why = nameProblem(name);
    if (why) { say(why); return; }
    if (name.trim() !== s.name) apply(renameStage(graph, s.id, name), `단계 이름을 "${name.trim()}"(으)로 바꿨어요.`);
  };
  return (
    <li ref={card} className={`lm-card${chosen ? " chosen" : ""}`} aria-label={`${s.name} 단계`}>
      <div className="lm-row lm-head">
        <button type="button" className="lm-name" aria-pressed={chosen} onClick={() => onPick(chosen ? null : { kind: "stage", stageId: s.id })}>{s.name}</button>
        <button type="button" className="btn btn-sm" onClick={() => { if (chosenStage) onPick(null); apply(removeStage(graph, s.id), `"${s.name}" 단계를 지웠어요. 되돌리기로 살릴 수 있어요.`); document.getElementById("lm-title")?.focus(); }}>단계 지우기</button>
      </div>
      <form className="lm-row" onSubmit={(e) => { e.preventDefault(); rename(); }}>
        <label>이름 <input value={name} onChange={(e) => setName(e.target.value)} maxLength={STAGE_NAME_MAX} /></label>
        <button type="submit" className="btn btn-sm">이름 바꾸기</button>
      </form>
      <BesideAdd graph={graph} apply={apply} say={say} onPick={onPick} s={s} />
      <div className="lm-part">
        <p><b>앞 단계</b> {before.length ? null : <span className="muted">없음(처음에 해요)</span>}</p>
        {before.length ? <ul className="lm-list">{before.map((b) => (
          <li key={b.id}>{b.name} <button type="button" className="btn btn-sm" aria-label={`${b.name}에서 오는 연결 끊기`} onClick={() => { apply(disconnect(graph, b.id, s.id), linkSaid(graph, b.id, s.id, true)); stay(); }}>끊기</button></li>
        ))}</ul> : null}
        {canFrom.length ? (
          <div className="lm-row">
            <label>앞 단계 고르기 <select value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="">고르기</option>
              {canFrom.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></label>
            <button type="button" className="btn btn-sm" aria-disabled={from ? undefined : true} onClick={link}>잇기</button>
          </div>
        ) : graph.stages.length > 1 ? <p className="muted">더 이을 수 있는 앞 단계가 없어요(이미 이었거나, 이으면 순서가 돌고 돌아요).</p> : null}
      </div>
      <div className="lm-part">
        <p><b>기술 {s.techs.length}</b></p>
        {s.techs.length ? <StageChips className="lm-chips" techs={s.techs} pool={pool} marking={marking} pickedTech={picked?.kind === "tech" && chosenStage ? picked.techId : null}
          onPick={(id) => onPick({ kind: "tech", stageId: s.id, techId: id })} onRemove={(t) => { apply(removeTech(graph, s.id, t.id), removeSaid(s.name, t.name)); stay(); }}
          onCandidate={(t) => { onCandidate(t.id, t.name); stay(); }} /> : null}{/* 고르는 동안 단추가 막혀 초점이 떨어지지 않게 카드 이름으로 */}
        {canPut.length ? (
          <div className="lm-row">
            <label>기술 넣기 <select value={tech} onChange={(e) => setTech(e.target.value)}>
              <option value="">고르기</option>
              {canPut.map((t) => <option key={t.id} value={t.id}>{t.name}{t.mark ? " · 적용 후보" : ""}</option>)}
            </select></label>
            <button type="button" className="btn btn-sm" aria-disabled={tech ? undefined : true} onClick={put}>넣기</button>
          </div>
        ) : <p className="muted">{pool.length ? "이 단계에 맞는 내 기술 · 적용 후보가 없어요." : "넣을 기술이 없어요. 지도에서 적용 후보로 고르면 생겨요."}</p>}
      </div>
    </li>
  );
}

/** 같은 순서에 단계 더하기(캔버스 블록 위 · 아래 +의 짝, P-12h S3): 앞 단계 선을 복사해 같은 줄에. 같은 순서가 가득이면 이유를 말하고 열지 않는다 */
function BesideAdd({ graph, apply, say, onPick, s }: Pick<PanelProps, "graph" | "apply" | "say" | "onPick"> & { s: Stage }) {
  const [open, setOpen] = useState(false), [name, setName] = useState("");
  const btn = useRef<HTMLButtonElement>(null);
  const blocked = parallelProblem(graph, s.id);
  const close = () => { btn.current?.focus(); setOpen(false); setName(""); }; // 입력이 사라지기 전에 초점을 단추로
  const add = () => {
    const r = addStageBeside(graph, name, s, 1);
    if ("problem" in r) { say(r.problem); return; }
    apply(r.graph, `"${s.name}"와(과) 같은 순서에 "${r.stage.name}" 단계를 더했어요.`);
    close(); onPick({ kind: "stage", stageId: r.stage.id });
  };
  return (
    <div className="lm-part">
      <button ref={btn} type="button" className="btn btn-sm" aria-expanded={open} aria-disabled={blocked ? true : undefined} title={blocked ?? undefined}
        onClick={() => (blocked ? say(blocked) : open ? close() : setOpen(true))}>같은 순서에 단계 더하기</button>
      {open ? (
        <form className="lm-row" onSubmit={(e) => { e.preventDefault(); add(); }} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          <label>같은 순서 단계 이름 <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={STAGE_NAME_MAX} /></label>
          <button type="submit" className="btn btn-primary btn-sm">더하기</button>
        </form>
      ) : null}
    </div>
  );
}
