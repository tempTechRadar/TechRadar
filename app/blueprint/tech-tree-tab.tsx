"use client";
// 하단 패널 기술 탭 = 기술 트리(P-12h S2, 유니티 프로젝트 창): 위 묶기 [1단][2단] · 찾기 · 태그, 왼쪽 폴더 트리(role=tree, ←→↑↓ · Home/End), 오른쪽 고른 폴더의 카드.
// 데이터: 서랍(pool = 내 기술 · 적용 후보 · 이력, 넣을 수 있음) + 관심 · 보류(보드와 같은 계산, tree-actions) + 그 외 = 카탈로그 찾기 결과만(2자 이상, 전체를 내려받지 않음).
// 불변 1: 끌기 · "넣기"는 서랍(pool)만. 관심 · 보류 · 그 외는 점선 카드 + "적용 후보로 고르기"(사람이 누를 때만 판단, markTech) → 다시 읽으면 실선. 위험 등급은 막음.
// 손님은 판단이 없어 "찾은 기술" 폴더 하나(지금처럼 끌어 놓을 수 있고, 확정은 로그인).
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { putTech } from "@/lib/blueprint/graph";
import { BLUEPRINT_GATE, stageFields } from "@/lib/blueprint/knowledge";
import { filterPool, poolTags, putProblem } from "@/lib/blueprint/panel-view";
import type { TechUsage } from "@/lib/blueprint/stored";
import { buildTechTree, DIM_KO, secondDims, type Folder, type Judgment, type TreeDim, type TreeItem } from "@/lib/blueprint/tech-tree";
import { GRADE_KO } from "@/lib/map/build-map";
import type { PoolTech } from "@/lib/server/blueprints";
import { searchAction } from "./actions";
import { TECH_DRAG, type PanelProps } from "./studio-types";
import { TechChip } from "./tech-chip";
import { treeExtrasAction, type JudgedTech, type TreeExtras } from "./tree-actions";

/** 트리 카드: 기술 정보 + 판단 + 넣을 수 있는지(서랍에 있음) */
type Item = PoolTech & TreeItem & { droppable: boolean; note: string | null };
const SAVE_KEY = "techradar-bp-tree"; // 고른 묶기 기준(이 브라우저만, 지도 보기 저장과 같은 방식)
const DIMS = Object.keys(DIM_KO) as TreeDim[];
const GUEST_FOLDER = "찾은 기술";

function useDims(): [TreeDim[], (d: TreeDim[]) => void] {
  const [dims, setDims] = useState<TreeDim[]>(["judgment"]);
  useEffect(() => { // 서버 그림과 같게 기본값으로 그린 뒤 저장값을 읽는다(하이드레이션 어긋남 없게)
    try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"); if (Array.isArray(v) && v.length && v.every((d) => DIMS.includes(d))) setDims(v.slice(0, 2)); } catch { /* 저장을 막은 브라우저: 기본 묶기 */ }
  }, []);
  return [dims, (d) => { setDims(d); try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 이번 화면에선 그대로 */ } }];
}

export function TechTreeTab(p: PanelProps & { usage: Map<string, TechUsage> }) {
  const { graph, picked, apply, pool, tags, say, usage, guest, onFound, projects, onCandidate, marking } = p;
  const add = useSearchParams()?.get("add") ?? null;
  const [dims, setDims] = useDims();
  const [term, setTerm] = useState(""), [tag, setTag] = useState<string | null>(null);
  const [found, setFound] = useState<PoolTech[] | null | undefined>(undefined); // undefined = 안 찾음, null = 찾기 실패
  const [busy, setBusy] = useState(false);
  const [extras, setExtras] = useState<TreeExtras | undefined>(undefined);
  const ask = useRef(0); // 찾기 차례: 글자를 바꾸면 늘려서 앞선 응답을 버린다
  useEffect(() => { if (!guest) treeExtrasAction().then(setExtras, () => setExtras({ kind: "error" })); }, [guest]);
  const stage = picked ? graph.stages.find((s) => s.id === picked.stageId) ?? null : null;
  const projectName = useMemo(() => new Map(projects.map((x) => [x.id, x.name])), [projects]);

  const items = useMemo(() => {
    const seen = new Set<string>(), out: Item[] = [];
    const push = (t: PoolTech | JudgedTech, judgment: Judgment, droppable: boolean) => {
      if (seen.has(t.id)) return; // 서랍 > 관심 · 보류 > 찾은 것(같은 기술은 한 번, 앞의 것이 이김: 고르면 서랍에 들어와 실선이 됨)
      seen.add(t.id);
      out.push({ ...t, judgment, droppable, note: "note" in t ? t.note : null, tags: tags?.[t.id] ?? [], projectNames: (t.projectIds ?? []).map((id) => projectName.get(id) ?? "이름 모름") });
    };
    for (const t of pool) push(t, t.mark === "candidate" ? "candidate" : t.projects > 0 ? "mine" : "other", true);
    if (extras?.kind === "ok") { for (const t of extras.interest) push(t, "interest", false); for (const t of extras.hold) push(t, "hold", false); }
    for (const t of found ?? []) push(t, "other", Boolean(guest)); // 손님은 찾은 기술을 그대로 넣는다(서랍 = 찾은 것)
    return out;
  }, [pool, extras, found, tags, projectName, guest]);

  const options = poolTags(items, tags);
  const tagNow = tag && options.includes(tag) ? tag : null;
  const target = add ? items.find((t) => t.id === add && t.droppable) : undefined;
  const shown = filterPool(items, { stage: stage?.name ?? null, term, tag: tagNow, tags, add: target ? add : null, usage });
  const tree: Folder<Item>[] = guest ? (shown.length ? [{ key: GUEST_FOLDER, name: GUEST_FOLDER, count: shown.length, items: shown, children: [] }] : []) : buildTechTree(shown, dims);

  const put = (t: Item) => {
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
        {guest ? null : <>
          <label className="tt-dim">묶기 <select value={dims[0]} onChange={(e) => { const d = e.target.value as TreeDim; setDims(dims[1] && dims[1] !== d ? [d, dims[1]] : [d]); }}>
            {DIMS.map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}</select></label>
          <label className="tt-dim">2단 <select value={dims[1] ?? ""} onChange={(e) => setDims(e.target.value ? [dims[0], e.target.value as TreeDim] : [dims[0]])}>
            <option value="">없음</option>{secondDims(dims[0]).map((d) => <option key={d} value={d}>{DIM_KO[d]}</option>)}</select></label>
        </>}
        <input type="search" value={term} onChange={(e) => { setTerm(e.target.value); setFound(undefined); ask.current++; setBusy(false); }} placeholder="기술 이름" aria-label="기술 이름으로 거르기" />
        <TagPick tags={tags} options={options} value={tagNow} onChange={setTag} />
        <button type="submit" className="btn dock-sm" aria-disabled={busy || term.trim().length < 2}>{busy ? "찾는 중…" : "카탈로그에서 찾기"}</button>
      </form>
      <p className="muted">{stage ? <><b>{stage.name}</b> 단계에 맞는 기술{fields ? `(${fields.join(" · ")})` : "(직접 지은 단계라 모두)"}. </> : "캔버스에서 단계를 고르면 그 단계에 맞는 기술만 보이고 \"넣기\"가 생겨요. "}{BLUEPRINT_GATE}</p>
      <p className="sr-only" aria-live="polite">{busy ? "찾는 중이에요" : found === null ? "찾은 결과를 불러오지 못했어요" : found ? `카탈로그에서 ${found.length}개 찾았어요` : ""}</p>
      {found === null ? <p className="notice notice-error" role="alert">찾은 결과를 불러오지 못했어요. 기술이 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</p> : null}
      {extras?.kind === "error" ? <p className="notice notice-error" role="alert">관심 · 보류를 불러오지 못했어요. 판단이 없다는 뜻이 아니에요. 나머지 기술은 그대로 보여요.</p> : null}
      {tree.length ? <Tree tree={tree} stage={stage?.name ?? null} placedIn={(id) => Boolean(stage?.techs.some((x) => x.id === id))} target={target?.id ?? null}
        usage={usage} marking={marking} onPut={put} onCandidate={guest ? undefined : onCandidate} />
        : <p className="muted">{items.length ? "이 조건에 맞는 기술이 없어요." : guest ? "로그인 전에는 위 \"카탈로그에서 찾기\"로 기술을 찾아 넣어요." : "아직 내 기술 · 적용 후보가 없어요. 지도에서 적용 후보로 고르면 여기에 와요."}</p>}
      {guest || found ? null : <p className="muted">그 외 기술은 위 &quot;카탈로그에서 찾기&quot;로 찾으면 &quot;그 외&quot; 폴더에 보여요.</p>}
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

type TreeProps = {
  tree: Folder<Item>[]; stage: string | null; placedIn: (id: string) => boolean; target: string | null; usage: Map<string, TechUsage>;
  marking: string | null; onPut: (t: Item) => void; onCandidate?: (techId: string, name: string) => void;
};

/** 펼쳐 보이는 폴더를 위에서부터 한 줄로(키보드 이동 차례) */
const visible = (fs: Folder<Item>[], open: Set<string>, depth = 1, parent: string | null = null): { f: Folder<Item>; depth: number; parent: string | null }[] =>
  fs.flatMap((f) => [{ f, depth, parent }, ...(open.has(f.key) ? visible(f.children, open, depth + 1, f.key) : [])]);

function Tree({ tree, stage, placedIn, target, usage, marking, onPut, onCandidate }: TreeProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const rows = visible(tree, open);
  const current = rows.find((r) => r.f.key === sel)?.f ?? tree[0];
  const refs = useRef(new Map<string, HTMLLIElement>());
  const go = (key: string) => { setSel(key); refs.current.get(key)?.focus(); };
  const toggle = (key: string, on: boolean) => setOpen((o) => { const n = new Set(o); if (on) n.add(key); else n.delete(key); return n; });
  // 트리 키보드(WAI-ARIA tree): ↑↓ 이동, → 펼치기 · 첫 자식, ← 접기 · 부모, Home/End
  const onKey = (e: KeyboardEvent, i: number) => {
    const r = rows[i], has = r.f.children.length > 0, isOpen = open.has(r.f.key);
    const to = { ArrowDown: rows[i + 1], ArrowUp: rows[i - 1], Home: rows[0], End: rows[rows.length - 1] }[e.key as "ArrowDown"];
    if (to) { e.preventDefault(); go(to.f.key); return; }
    if (e.key === "ArrowRight" && has) { e.preventDefault(); if (!isOpen) toggle(r.f.key, true); else go(r.f.children[0].key); }
    if (e.key === "ArrowLeft") { e.preventDefault(); if (has && isOpen) toggle(r.f.key, false); else if (r.parent) go(r.parent); }
  };
  return (
    <div className="tt">
      <ul className="tt-tree" role="tree" aria-label="기술 폴더">
        {rows.map((r, i) => {
          const has = r.f.children.length > 0, here = r.f.key === current.key;
          return (
            <li key={r.f.key} ref={(el) => { if (el) refs.current.set(r.f.key, el); else refs.current.delete(r.f.key); }} role="treeitem" aria-level={r.depth}
              aria-selected={here} aria-expanded={has ? open.has(r.f.key) : undefined} tabIndex={here ? 0 : -1} className="tt-item" style={{ paddingLeft: 8 + (r.depth - 1) * 16 }}
              onClick={() => { setSel(r.f.key); if (has) toggle(r.f.key, !open.has(r.f.key)); }} onKeyDown={(e) => onKey(e, i)}>
              <span aria-hidden="true" className="tt-caret">{has ? (open.has(r.f.key) ? "▾" : "▸") : ""}</span>{r.f.name} <span className="muted">{r.f.count}</span>
            </li>
          );
        })}
      </ul>
      <section className="tt-cards" aria-label={`${current.name} 기술`}>
        <h3 className="dock-h">{current.key.split("/").join(" › ")} <span className="muted">{current.count}</span></h3>
        <ul className="dock-techs">{current.items.map((t) => <Card key={t.id} t={t} use={usage.get(t.id)} stage={stage} placed={placedIn(t.id)} added={t.id === target}
          busy={marking === t.id} onPut={() => onPut(t)} onCandidate={onCandidate ? () => onCandidate(t.id, t.name) : undefined} />)}</ul>
      </section>
    </div>
  );
}

/** 넣을 수 있는 카드(실선, 끌기 · 넣기) 또는 판단 전 카드(점선, "적용 후보로 고르기"만). 등급은 점 색만이 아니라 글자로도 */
function Card({ t, use, stage, placed, added, busy, onPut, onCandidate }: { t: Item; use?: TechUsage; stage: string | null; placed: boolean; added: boolean; busy: boolean; onPut: () => void; onCandidate?: () => void }) {
  const risky = t.grade === "danger", can = t.droppable && !risky;
  const facts = [t.field, t.projects ? `내 프로젝트 ${t.projects}개` : null, use ? `확정 ${use.n}번` : null].filter(Boolean).join(" · ");
  return (
    <li className={`dock-tech${risky ? " risky" : ""}${added ? " added" : ""}${t.droppable ? "" : " tt-out"}`} draggable={can}
      onDragStart={(e) => { if (!can) return; e.dataTransfer.setData(TECH_DRAG, t.id); e.dataTransfer.effectAllowed = "copy"; }}>
      <span className="dock-chip"><TechChip tech={t} info={t} />{t.grade !== "pass" ? <span className={`dock-grade g-${t.grade}`}>{GRADE_KO[t.grade]}</span> : null}</span>
      {facts ? <span className="muted">{facts}</span> : null}
      {t.note ? <span className="muted">{t.judgment === "hold" ? `보류 이유: ${t.note}` : t.note}</span> : null}
      {t.tags.length ? <span className="dock-tags">{t.tags.map((x) => <span key={x} className="tag">{x}</span>)}</span> : null}
      {risky ? <span className="dock-risky">✕ 위험 등급이라 넣지 않아요</span>
        : !t.droppable ? (onCandidate ? <button type="button" className="btn dock-sm" disabled={busy} onClick={onCandidate}>{busy ? "고르는 중…" : "적용 후보로 고르기"}</button> : null)
        : placed ? <span className="muted">✓ {stage}에 있어요</span>
        : stage ? <button type="button" className="btn dock-sm" onClick={onPut}>{stage}에 넣기</button> : null}
    </li>
  );
}
