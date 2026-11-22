"use client";
// 청사진 스튜디오 하단 패널(P-12e 조각 K, 유니티식): 높이 조절 · 접기, 탭 = 기술 | 불러오기(P-12h S1: 단계 칸이 없어져 탭을 둘로).
// 기술 = 넣을 기술 + 관심 · 적용 후보 · 보류 묶음(옛 후보 탭, S2 기술 트리 전까지). 불러오기 = 템플릿(template-tab) · 내 이력 · 질문으로 틀 만들기.
// AI 점검은 위 막대 "확정 · 내보내기" 창으로 옮김.
// 기술 탭 = 옛 서랍(drawer.tsx) 로직: 관문(내 기술 · 적용 후보 · 이력만, candidateIds) · 고른 단계에 맞는 것(fitsStage) · 내 태그 · ?add= 강조.
// 끌어서 캔버스 단계에 놓거나(TECH_DRAG, 놓기는 studio), 키보드로 "고른 단계에 넣기". 그래프는 apply로만 바꾼다.
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toBoard, usageOf, HISTORY_LIMIT, type BlueprintRecord, type TechUsage } from "@/lib/blueprint/stored";
import { fromV1, putTech } from "@/lib/blueprint/graph";
import { BLUEPRINT_GATE, stageFields } from "@/lib/blueprint/knowledge";
import { filterPool, poolTags, putProblem } from "@/lib/blueprint/panel-view";
import { GRADE_KO } from "@/lib/map/build-map";
import type { PoolTech } from "@/lib/server/blueprints";
import { searchAction } from "./actions";
import { CandidateTab } from "./candidate-tab";
import { TemplateTab } from "./template-tab";
import { TechChip } from "./tech-chip";
import { TECH_DRAG, type PanelProps } from "./studio-types";
import "./dock.css";

type Tab = "tech" | "load";
const TABS: [Tab, string][] = [["tech", "기술"], ["load", "불러오기"]];
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
  const [tab, setTab] = useState<Tab>("tech");
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
              {name}
            </button>
          ))}
        </div>
        <button type="button" className="dock-tab" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "접기 ▼" : "펼치기 ▲"}</button>
      </div>
      {open ? (
        <div className="dock-body">
          {tab === "tech" ? <>
            <TechTab {...p} usage={usage} />
            {/* 옛 후보 탭(P-12f ⑤ 보드 녹이기): S2 기술 트리 전까지 기술 탭 안의 묶음. 손님은 내 판단이 없어 뺀다 */}
            {p.guest ? null : <CandidateGroup {...p} />}
          </> : <LoadTab {...p} usage={usage} />}
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

function TechTab({ graph, picked, apply, pool, tags, say, usage, guest, onFound }: PanelProps & { usage: Map<string, TechUsage> }) {
  const add = useSearchParams()?.get("add") ?? null;
  const [term, setTerm] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [found, setFound] = useState<PoolTech[] | null | undefined>(undefined); // undefined = 안 찾음, null = 찾기 실패
  const [busy, setBusy] = useState(false);
  const ask = useRef(0); // 찾기 차례: 글자를 바꾸면 늘려서 앞선 응답을 버린다
  const stage = picked ? graph.stages.find((s) => s.id === picked.stageId) ?? null : null;
  const options = poolTags(pool, tags);
  const tagNow = tag && options.includes(tag) ? tag : null;
  const target = add ? pool.find((t) => t.id === add) : undefined;
  const shown = filterPool(pool, { stage: stage?.name ?? null, term, tag: tagNow, tags, add: target ? add : null, usage });
  const more = (found ?? []).filter((t) => !pool.some((x) => x.id === t.id));
  const put = (t: PoolTech) => {
    if (!stage) return;
    const why = putProblem(stage, t);
    if (why) { say(why); return; }
    apply(putTech(graph, stage.id, { id: t.id, name: t.name }), `${stage.name}에 ${t.name}을(를) 넣었어요.`);
  };
  const search = async () => {
    const n = ++ask.current;
    setBusy(true);
    const got = await searchAction(term).catch(() => null);
    if (n === ask.current) { setFound(got); setBusy(false); if (got) onFound?.(got); }
  };
  const fields = stage ? stageFields(stage.name) : undefined;
  return (
    <>
      {add ? <p className={`notice ${target && target.grade !== "danger" ? "" : "notice-error"}`} role="status">
        {!target ? "적용 후보로 고른 것만 넣을 수 있어요. 지도나 알림에서 적용 후보로 고른 뒤 다시 와 주세요."
          : target.grade === "danger" ? <><b>{target.name}</b>은(는) 위험 등급이라 청사진에 넣지 않아요.</>
          : <><b>{target.name}</b>: 넣을 단계를 캔버스에서 고르거나, 이 카드를 단계로 끌어 놓으세요.</>}
      </p> : null}
      <form className="dock-row" role="search" onSubmit={(e) => { e.preventDefault(); if (!busy && term.trim().length >= 2) void search(); }}>
        <input type="search" value={term} onChange={(e) => { setTerm(e.target.value); setFound(undefined); ask.current++; setBusy(false); }} placeholder="기술 이름" aria-label="기술 이름으로 거르기" />
        <TagPick tags={tags} options={options} value={tagNow} onChange={setTag} />
        <button type="submit" className="btn dock-sm" aria-disabled={busy || term.trim().length < 2}>{busy ? "찾는 중…" : "카탈로그에서 찾기"}</button>
      </form>
      <p className="muted">{stage ? <><b>{stage.name}</b> 단계에 맞는 기술{fields ? `(${fields.join(" · ")})` : "(직접 지은 단계라 모두)"}. </> : "캔버스에서 단계를 고르면 그 단계에 맞는 기술만 보이고 \"넣기\"가 생겨요. "}{BLUEPRINT_GATE}</p>
      <p className="sr-only" aria-live="polite">{busy ? "찾는 중이에요" : found === null ? "찾은 결과를 불러오지 못했어요" : found ? `카탈로그에서 ${more.length}개 찾았어요` : ""}</p>
      {shown.length ? <ul className="dock-techs">{shown.map((t) => <TechCard key={t.id} t={t} use={usage.get(t.id)} tags={tags?.[t.id]} stage={stage?.name ?? null} placed={Boolean(stage?.techs.some((x) => x.id === t.id))} added={t === target} onPut={() => put(t)} />)}</ul>
        : <p className="muted">{pool.length ? "이 조건에 맞는 내 기술 · 적용 후보가 없어요." : guest ? "로그인 전에는 위 \"카탈로그에서 찾기\"로 기술을 찾아 넣어요." : "아직 내 기술 · 적용 후보가 없어요. 지도에서 적용 후보로 고르면 여기에 와요."}</p>}
      {found === null ? <p className="notice notice-error" role="alert">찾은 결과를 불러오지 못했어요. 기술이 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</p> : null}
      {found ? <><h3 className="dock-h">카탈로그 <span className="muted">{more.length}</span></h3>
        {more.length ? <ul className="dock-techs">{more.map((t) => guest ? <TechCard key={t.id} t={t} stage={stage?.name ?? null} placed={Boolean(stage?.techs.some((x) => x.id === t.id))} onPut={() => put(t)} />
          : <TechCard key={t.id} t={t} stage={null} gated onPut={() => undefined} />)}</ul> : <p className="muted">더 찾은 기술이 없어요.</p>}</> : null}
    </>
  );
}

/** 내 태그로 거르기. 태그를 못 읽었으면 고르지 못하게 하고 이유를 말한다(없는 것과 다르게, 불변 2) */
function TagPick({ tags, options, value, onChange }: { tags: Record<string, string[]> | null; options: string[]; value: string | null; onChange: (t: string | null) => void }) {
  if (tags === null) return <span className="muted">내 태그를 불러오지 못했어요</span>;
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
      onDragStart={(e) => { if (risky || gated) return; e.dataTransfer.setData(TECH_DRAG, t.id); e.dataTransfer.effectAllowed = "copy"; }}>
      {/* 칩 모양은 단계 노드와 같게(tech-chip). 끌기는 이 카드(li)가 맡고, 등급은 점 색만이 아니라 글자로도 */}
      <span className="dock-chip"><TechChip tech={t} info={t} />{t.grade !== "pass" ? <span className={`dock-grade g-${t.grade}`}>{GRADE_KO[t.grade]}</span> : null}</span>
      {facts ? <span className="muted">{facts}</span> : null}
      {tags?.length ? <span className="dock-tags">{tags.map((x) => <span key={x} className="tag">{x}</span>)}</span> : null}
      {risky ? <span className="dock-risky">✕ 위험 등급이라 넣지 않아요</span>
        : gated ? <a className="dock-link" href={`/?sel=${encodeURIComponent(`tech:${t.id}`)}`}>지도에서 적용 후보로 고르기</a>
        : placed ? <span className="muted">✓ {stage}에 있어요</span>
        : stage ? <button type="button" className="btn dock-sm" onClick={onPut}>{stage}에 넣기</button> : null}
    </li>
  );
}

/** 옛 후보 탭 묶음: 펼칠 때만 그려서 서버에서 읽는다(접어 둔 채로 탭을 오갈 때마다 다시 읽지 않게) */
function CandidateGroup(p: PanelProps) {
  const [open, setOpen] = useState(false);
  return <details className="dock-group" onToggle={(e) => setOpen(e.currentTarget.open)}><summary>관심 · 적용 후보 · 보류</summary>{open ? <CandidateTab {...p} /> : null}</details>;
}

/** 불러오기 탭: 질문으로 틀 만들기(손님도 됨, 이 브라우저 판) · 템플릿 · 내 이력(로그인) */
function LoadTab(p: PanelProps & { usage: Map<string, TechUsage> }) {
  return (
    <>
      <p className="dock-row"><button type="button" className="btn dock-sm" onClick={p.onAsk}>질문으로 틀 만들기</button><span className="muted">몇 가지 물음에 답하면 단계 틀을 만들어 줘요.</span></p>
      {p.guest ? <p className="notice" role="status">로그인하면 템플릿을 저장 · 공개하고, 확정한 청사진을 불러올 수 있어요. <a href={`/login?next=${encodeURIComponent("/blueprint")}`}>로그인</a> · 지금 판은 이 브라우저에 그대로 있어요.</p> : <>
        <h3 className="dock-h">템플릿</h3>
        <TemplateTab {...p} />
        <h3 className="dock-h">내 이력{p.history ? ` ${p.history.length}` : ""}</h3>
        <HistTab {...p} />
      </>}
    </>
  );
}

function HistTab({ graph, history, apply, usage }: PanelProps & { usage: Map<string, TechUsage> }) {
  if (history === null) return <p className="notice notice-error" role="alert">내 이력을 불러오지 못했어요. 확정한 게 없다는 뜻이 아니에요. 판 만들기는 그대로 쓸 수 있어요.</p>;
  if (!history.length) return <p className="muted">아직 확정한 청사진이 없어요. 위 "확정 · 내보내기"에서 확정하면 여기에 쌓여요.</p>;
  // 확인 창 대신 되돌리기(studio가 50단계 쌓음): 지금 판이 있으면 알림에서 되돌릴 수 있다고 말한다
  // 판과 이름을 한 되돌리기 칸에(apply의 name): 되돌리면 이름도 돌아가고, 시작 템플릿 표시도 studio가 지운다
  const load = (h: BlueprintRecord) => apply(fromV1(toBoard(h.board)), `"${h.name}"을(를) 불러왔어요.${graph.stages.length ? " 전 판은 되돌리기로 돌아와요." : ""}`, h.name);
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
