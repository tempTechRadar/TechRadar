"use client";
// 청사진 스튜디오 하단 패널(P-12e 조각 K, 유니티식): 높이 조절 · 접기, 탭 = 기술 | 내 이력 | 템플릿 | AI 점검.
// 단계별 기본 탭: ① 단계 구축 → 템플릿(틀), ② 스킬 붙이기 → 기술, ③ 결과물 → AI 점검. 템플릿 · AI 점검 내용은 조각 F · I가 채운다(그전엔 준비 중).
// 기술 탭 = 옛 서랍(drawer.tsx) 로직: 관문(내 기술 · 적용 후보 · 이력만, candidateIds) · 고른 단계에 맞는 것(fitsStage) · 내 태그 · ?add= 강조.
// 끌어서 캔버스 단계에 놓거나(TECH_DRAG, 놓기는 studio), 키보드로 "고른 단계에 넣기". 그래프는 apply로만 바꾼다.
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toBoard, usageOf, HISTORY_LIMIT, type BlueprintRecord, type TechUsage } from "@/lib/blueprint/stored";
import { fromV1, putTech } from "@/lib/blueprint/graph";
import { BLUEPRINT_GATE, STAGE_FIELDS } from "@/lib/blueprint/knowledge";
import { filterPool, poolTags, putProblem } from "@/lib/blueprint/panel-view";
import { GRADE_KO } from "@/lib/map/build-map";
import type { PoolTech } from "@/lib/server/blueprints";
import { searchAction } from "./actions";
import { TECH_DRAG, type PanelProps, type Step } from "./studio-types";
import "./dock.css";

type Tab = "tech" | "hist" | "tpl" | "check";
const TABS: [Tab, string][] = [["tech", "기술"], ["hist", "내 이력"], ["tpl", "템플릿"], ["check", "AI 점검"]];
const STEP_TAB: Record<Step, Tab> = { 1: "tpl", 2: "tech", 3: "check" };
const H = { min: 120, start: 260, step: 24, max: 560 };
/** 높이 한도 = 화면 높이의 70%. 서버는 화면을 몰라 기본값으로 그리고, 붙은 뒤(useEffect) 맞춘다(하이드레이션 어긋남 없게) */
function useMaxH() {
  const [max, setMax] = useState(H.max);
  useEffect(() => {
    const fit = () => setMax(Math.max(H.min, Math.round(window.innerHeight * 0.7)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return max;
}
const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });

export function Dock(p: PanelProps) {
  const [tab, setTab] = useState<Tab>(STEP_TAB[p.step]);
  useEffect(() => setTab(STEP_TAB[p.step]), [p.step]); // 단계를 바꾸면 그 단계에 쓰는 탭으로
  const [open, setOpen] = useState(true);
  const [h, setH] = useState(H.start);
  const usage = useMemo(() => usageOf(p.history ?? []), [p.history]);
  const max = useMaxH();
  const clamp = (v: number) => Math.min(max, Math.max(H.min, Math.round(v)));
  return (
    <section className="dock" aria-label="하단 패널" style={{ height: open ? Math.min(h, max) : undefined }}>
      {open ? <Resizer h={Math.min(h, max)} max={max} onH={(v) => setH(clamp(v))} /> : null}
      <div className="dock-bar">
        <div className="dock-tabs" role="group" aria-label="하단 패널 보기">
          {TABS.map(([k, name]) => (
            <button key={k} type="button" className="dock-tab" aria-pressed={tab === k} onClick={() => { setTab(k); setOpen(true); }}>
              {name}{k === "hist" && p.history ? ` ${p.history.length}` : ""}
            </button>
          ))}
        </div>
        <button type="button" className="dock-tab" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기 ▼" : "펼치기 ▲"}</button>
      </div>
      {open ? (
        <div className="dock-body">
          {tab === "tech" ? <TechTab {...p} usage={usage} /> : null}
          {tab === "hist" ? <HistTab {...p} usage={usage} /> : null}
          {tab === "tpl" ? <Soon what="템플릿" text="틀(단계와 연결만)과 조합(단계와 기술)을 골라 판에 펼치는 곳이에요. 템플릿 서버가 합쳐지면 채워져요." /> : null}
          {tab === "check" ? <Soon what="AI 점검" text="확정한 청사진을 '점검 받기'로 한 번 점검해 제안만 보여 주는 곳이에요(청사진은 바뀌지 않아요). 점검 서버가 합쳐지면 채워져요." /> : null}
        </div>
      ) : null}
    </section>
  );
}

/** 높이 조절 막대: 끌거나(포인터) ↑ ↓ 키로 24px씩 */
function Resizer({ h, max, onH }: { h: number; max: number; onH: (v: number) => void }) {
  const from = useRef<{ y: number; h: number } | null>(null);
  return (
    <div className="dock-resize" role="separator" aria-orientation="horizontal" aria-label="하단 패널 높이" tabIndex={0}
      aria-valuenow={h} aria-valuemin={H.min} aria-valuemax={max}
      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onH(h + (e.key === "ArrowUp" ? H.step : -H.step)); } }}
      onPointerDown={(e) => { from.current = { y: e.clientY, h }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={(e) => { if (from.current) onH(from.current.h + from.current.y - e.clientY); }}
      onPointerUp={() => { from.current = null; }} onPointerCancel={() => { from.current = null; }} />
  );
}

function Soon({ what, text }: { what: string; text: string }) {
  return <div className="notice notice-empty"><strong>{what} (준비 중)</strong> {text}</div>;
}

function TechTab({ graph, picked, apply, pool, tags, say, usage }: PanelProps & { usage: Map<string, TechUsage> }) {
  const add = useSearchParams()?.get("add") ?? null;
  const [term, setTerm] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [found, setFound] = useState<PoolTech[] | null | undefined>(undefined); // undefined = 안 찾음, null = 찾기 실패
  const [busy, setBusy] = useState(false);
  const stage = picked ? graph.stages.find((s) => s.id === picked.stageId) ?? null : null;
  const target = add ? pool.find((t) => t.id === add) : undefined;
  const shown = filterPool(pool, { stage: stage?.name ?? null, term, tag, tags, add: target ? add : null, usage });
  const more = (found ?? []).filter((t) => !pool.some((x) => x.id === t.id));
  const put = (t: PoolTech) => {
    if (!stage) return;
    const why = putProblem(stage, t);
    if (why) { say(why); return; }
    apply(putTech(graph, stage.id, { id: t.id, name: t.name }), `${stage.name}에 ${t.name}을(를) 넣었어요.`);
  };
  const search = async () => { setBusy(true); setFound(await searchAction(term).catch(() => null)); setBusy(false); };
  const fields = stage ? STAGE_FIELDS[stage.name] : undefined;
  return (
    <>
      {add ? <p className={`notice ${target && target.grade !== "danger" ? "" : "notice-error"}`} role="status">
        {!target ? "적용 후보로 고른 것만 넣을 수 있어요. 지도나 알림에서 적용 후보로 고른 뒤 다시 와 주세요."
          : target.grade === "danger" ? <><b>{target.name}</b>은(는) 위험 등급이라 청사진에 넣지 않아요.</>
          : <><b>{target.name}</b>: 넣을 단계를 캔버스에서 고르거나, 이 카드를 단계로 끌어 놓으세요.</>}
      </p> : null}
      <form className="dock-row" role="search" onSubmit={(e) => { e.preventDefault(); if (!busy && term.trim().length >= 2) void search(); }}>
        <input type="search" value={term} onChange={(e) => { setTerm(e.target.value); setFound(undefined); }} placeholder="기술 이름" aria-label="기술 이름으로 거르기" />
        <TagPick tags={tags} options={poolTags(pool, tags)} value={tag} onChange={setTag} />
        <button type="submit" className="btn dock-sm" aria-disabled={busy || term.trim().length < 2}>{busy ? "찾는 중…" : "카탈로그에서 찾기"}</button>
      </form>
      <p className="muted">{stage ? <><b>{stage.name}</b> 단계에 맞는 기술{fields ? `(${fields.join(" · ")})` : "(직접 지은 단계라 모두)"}. </> : "캔버스에서 단계를 고르면 그 단계에 맞는 기술만 보이고 \"넣기\"가 생겨요. "}{BLUEPRINT_GATE}</p>
      <p className="sr-only" aria-live="polite">{busy ? "찾는 중이에요" : found === null ? "찾지 못했어요" : found ? `카탈로그에서 ${more.length}개 찾았어요` : ""}</p>
      {shown.length ? <ul className="dock-techs">{shown.map((t) => <TechCard key={t.id} t={t} use={usage.get(t.id)} tags={tags?.[t.id]} stage={stage?.name ?? null} placed={Boolean(stage?.techs.some((x) => x.id === t.id))} added={t === target} onPut={() => put(t)} />)}</ul>
        : <p className="muted">{pool.length ? "이 조건에 맞는 내 기술 · 적용 후보가 없어요." : "아직 내 기술 · 적용 후보가 없어요. 지도에서 적용 후보로 고르면 여기에 와요."}</p>}
      {found === null ? <p className="notice notice-error" role="alert">카탈로그를 찾지 못했어요. 기술이 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</p> : null}
      {found ? <><h3 className="dock-h">카탈로그 <span className="muted">{more.length}</span></h3>
        {more.length ? <ul className="dock-techs">{more.map((t) => <TechCard key={t.id} t={t} stage={null} gated onPut={() => undefined} />)}</ul> : <p className="muted">더 찾은 기술이 없어요.</p>}</> : null}
    </>
  );
}

/** 내 태그로 거르기. 태그를 못 읽었으면 고르지 못하게 하고 이유를 말한다(없는 것과 다르게, 불변 2) */
function TagPick({ tags, options, value, onChange }: { tags: Record<string, string[]> | null; options: string[]; value: string | null; onChange: (t: string | null) => void }) {
  if (tags === null) return <span className="muted">내 태그를 읽지 못했어요</span>;
  if (!options.length) return null;
  return (
    <select aria-label="내 태그로 거르기" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">내 태그 전체</option>
      {options.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

/** gated: 카탈로그에서 찾은 것(적용 후보가 아님) — 넣지 않고 지도에서 고르게. added: 보드에서 넣으러 온 기술 */
/** placed: 고른 단계에 이미 들어 있음(넣기 대신 그렇다고 말함) */
function TechCard({ t, use, tags, stage, placed = false, added = false, gated = false, onPut }: { t: PoolTech; use?: TechUsage; tags?: string[]; stage: string | null; placed?: boolean; added?: boolean; gated?: boolean; onPut: () => void }) {
  const risky = t.grade === "danger";
  const facts = [t.field, t.projects ? `내 프로젝트 ${t.projects}개` : null, t.mark ? "적용 후보" : null, use ? `확정 ${use.n}번` : null].filter(Boolean).join(" · ");
  return (
    <li className={`dock-tech${risky ? " risky" : ""}${added ? " added" : ""}`} draggable={!risky && !gated}
      onDragStart={(e) => { e.dataTransfer.setData(TECH_DRAG, t.id); e.dataTransfer.effectAllowed = "copy"; }}>
      <span><b>{t.name}</b>{t.grade !== "pass" ? <span className={`dock-grade g-${t.grade}`}> {GRADE_KO[t.grade]}</span> : null}</span>
      {facts ? <span className="muted">{facts}</span> : null}
      {tags?.length ? <span className="dock-tags">{tags.map((x) => <span key={x} className="tag">{x}</span>)}</span> : null}
      {risky ? <span className="dock-risky">✕ 위험 등급이라 넣지 않아요</span>
        : gated ? <a className="dock-link" href={`/?sel=${encodeURIComponent(`tech:${t.id}`)}`}>지도에서 적용 후보로 고르기</a>
        : placed ? <span className="muted">✓ {stage}에 있어요</span>
        : stage ? <button type="button" className="btn dock-sm" onClick={onPut}>{stage}에 넣기</button> : null}
    </li>
  );
}

function HistTab({ graph, history, apply, usage }: PanelProps & { usage: Map<string, TechUsage> }) {
  if (history === null) return <p className="notice notice-error" role="alert">내 이력을 읽지 못했어요. 확정한 게 없다는 뜻이 아니에요. 판 만들기는 그대로 쓸 수 있어요.</p>;
  if (!history.length) return <p className="muted">아직 확정한 청사진이 없어요. ③ 결과물에서 확정하면 여기에 쌓여요.</p>;
  // 확인 창 대신 되돌리기(studio가 50단계 쌓음): 지금 판이 있으면 알림에서 되돌릴 수 있다고 말한다
  const load = (h: BlueprintRecord) => apply(fromV1(toBoard(h.board)), `"${h.name}"을(를) 불러왔어요.${graph.stages.length ? " 전 판은 되돌리기로 돌아와요." : ""}`);
  const names = new Map(history.flatMap((h) => h.board.flat().flatMap((s) => s.techs.map((t) => [t.id, t.name] as const))));
  const top = [...usage].sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  return (
    <div className="dock-cols">
      <section aria-labelledby="dock-hist">
        <h3 id="dock-hist" className="dock-h">확정한 청사진 <span className="muted">{history.length}</span></h3>
        {history.length >= HISTORY_LIMIT ? <p className="muted">최근 {HISTORY_LIMIT}개만 보여요. 쓴 횟수도 이 안에서 셌어요.</p> : null}
        <ul className="dock-techs">{history.map((h) => (
          <li key={h.id} className="dock-tech">
            <span><b>{h.name}</b><span className="muted"> · {h.projectName ?? "프로젝트 없음"} · {when.format(new Date(h.createdAt))}</span></span>
            <span className="muted">{h.board.map((c) => c.map((s) => s.name).join(" + ")).join(" → ")}</span>
            <button type="button" className="btn dock-sm" onClick={() => load(h)}>불러오기</button>
          </li>
        ))}</ul>
      </section>
      <section aria-labelledby="dock-top">
        <h3 id="dock-top" className="dock-h">자주 쓴 기술</h3>
        {top.length ? <ul className="dock-techs">{top.map(([id, x]) => (
          <li key={id} className="dock-tech"><span><b>{names.get(id) ?? "이름 모름"}</b><span className="muted"> · {x.n}번 · 프로젝트 {x.projects}개 · {x.stages.join(", ")}</span></span></li>
        ))}</ul> : <p className="muted">확정한 청사진에 붙인 기술이 아직 없어요.</p>}
      </section>
    </div>
  );
}
