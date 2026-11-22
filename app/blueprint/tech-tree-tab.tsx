"use client";
// 하단 패널 기술 탭 = 기술 트리(P-12h S2, 유니티 프로젝트 창): 위 묶기 [1단][2단] · 이름 거르기 · 태그, 왼쪽 폴더 트리(role=tree, ←→↑↓ · Home/End), 오른쪽 고른 폴더의 카드.
// 데이터: 서랍(pool = 내 기술 · 적용 후보 · 이력, 넣을 수 있음) + 관심 · 보류(보드와 같은 계산, tree-actions). 카탈로그 찾기는 없앰(P-12h-2 T3: 기술은 지도에서 고른다).
// 불변 1: 끌기 · "넣기"는 서랍(pool)만. 관심 · 보류는 점선 카드 + "적용 후보로 고르기"(사람이 누를 때만 판단, markTech) → 다시 읽으면 실선. 위험 등급은 막음.
// 손님은 판단이 없어 "지도에서 담은 기술" 폴더 하나(지도 "청사진에 담기" → 이 브라우저 목록, 끌어 놓을 수 있고 확정은 로그인).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { putTech } from "@/lib/blueprint/graph";
import { STUDIO_GATE, stageFields } from "@/lib/blueprint/knowledge";
import { filterPool, poolTags, putProblem, putSaid } from "@/lib/blueprint/panel-view";
import type { TechUsage } from "@/lib/blueprint/stored";
import { buildTechTree, DIM_KO, judgeTechs, pathTo, secondDims, type Folder, type Judged, type TreeDim } from "@/lib/blueprint/tech-tree";
import { GRADE_KO } from "@/lib/map/build-map";
import type { PoolTech } from "@/lib/server/blueprints";
import { TECH_DRAG, type PanelProps } from "./studio-types";
import { TechChip } from "./tech-chip";
import type { TreeExtras } from "./tree-actions";

/** 트리 카드: 기술 정보 + 판단 + 넣을 수 있는지(서랍에 있음, judgeTechs) */
type Item = Judged<PoolTech> & { tags: string[]; projectNames: string[] };
/** 오른쪽 칸이 따라갈 기술(?add= · 찾은 첫 결과 · 방금 고른 것). focus면 초점 잃었을 때 그 카드로 */
type Follow = { id: string; focus: boolean } | null;
const SAVE_KEY = "techradar-bp-tree"; // 고른 묶기 기준(이 브라우저만, 지도 보기 저장과 같은 방식)
const DIMS = Object.keys(DIM_KO) as TreeDim[];
const GUEST_FOLDER = "지도에서 담은 기술";
const GUEST_GATE = "로그인 전에는 지도에서 담은 기술을 넣어요. 실제 설치는 Claude Code에서 직접 해요."; // 손님은 관문(내 기술 · 적용 후보 · 확정 이력)이 없다

function useDims(): [TreeDim[], (d: TreeDim[]) => void] {
  const [dims, setDims] = useState<TreeDim[]>(["judgment"]);
  useEffect(() => { // 서버 그림과 같게 기본값으로 그린 뒤 저장값을 읽는다(하이드레이션 어긋남 없게)
    try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"); if (Array.isArray(v) && v.length && v.every((d) => DIMS.includes(d))) setDims(v.slice(0, 2)); } catch { /* 저장을 막은 브라우저: 기본 묶기 */ }
  }, []);
  return [dims, (d) => { setDims(d); try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 이번 화면에선 그대로 */ } }];
}

/** extras = 관심 · 보류(Dock이 읽어 탭을 바꿔도 다시 읽지 않음, undefined = 읽는 중) */
export function TechTreeTab(p: PanelProps & { usage: Map<string, TechUsage>; extras: TreeExtras | undefined }) {
  const { graph, picked, apply, pool, tags, say, usage, guest, guestPicks, projects, onCandidate, marking, extras } = p;
  const add = useSearchParams()?.get("add") ?? null;
  const [dims, setDims] = useDims();
  const [term, setTerm] = useState(""), [tag, setTag] = useState<string | null>(null);
  const [follow, setFollow] = useState<Follow>(null);
  const found = guestPicks?.techs;
  const last = useRef(marking);
  useEffect(() => { if (last.current && !marking) setFollow({ id: last.current, focus: true }); last.current = marking; }, [marking]); // 고르기 · 다시 읽기가 끝나면 옮겨 간 폴더로
  const stage = picked ? graph.stages.find((s) => s.id === picked.stageId) ?? null : null;
  const projectName = useMemo(() => new Map(projects.map((x) => [x.id, x.name])), [projects]);

  const items: Item[] = useMemo(() => {
    const ok = extras?.kind === "ok" ? extras : null;
    return judgeTechs<PoolTech>({ pool, interest: ok?.interest ?? [], hold: ok?.hold ?? [], found: found ?? [], guest: Boolean(guest) })
      .map((t) => ({ ...t, tags: tags?.[t.id] ?? [], projectNames: (t.projectIds ?? []).map((id) => projectName.get(id) ?? "이름 모름") }));
  }, [pool, extras, found, tags, projectName, guest]);
  // 태그를 못 읽었으면 "내 태그" 묶기를 쓰지 않는다("태그 없음"으로 보이면 못 읽은 것이 없는 것처럼 보임, 불변 2)
  const usable = tags === null ? dims.filter((d) => d !== "tag") : dims;
  const by: TreeDim[] = usable.length ? usable : ["judgment"];

  const options = poolTags(items, tags);
  const tagNow = tag && options.includes(tag) ? tag : null;
  const target = add ? items.find((t) => t.id === add && t.droppable) : undefined;
  useEffect(() => { if (target) setFollow({ id: target.id, focus: false }); }, [target?.id]); // target은 매번 새 객체라 id로만
  const shown = filterPool(items, { stage: stage?.name ?? null, term, tag: tagNow, tags, add: target ? add : null, usage });
  const tree: Folder<Item>[] = guest ? (shown.length ? [{ key: GUEST_FOLDER, path: [GUEST_FOLDER], name: GUEST_FOLDER, count: shown.length, items: shown, children: [] }] : []) : buildTechTree(shown, by);

  /** 넣기(카드 단추 · ?add= 단계 고르기): 서랍 · 캔버스와 같은 검사 · 같은 말 */
  const put = (t: Item, to = stage) => {
    if (!to) return;
    const why = putProblem(to, t);
    if (why) { say(why); return; }
    apply(putTech(graph, to.id, { id: t.id, name: t.name }), putSaid(to.name, t.name));
  };
  const fields = stage ? stageFields(stage.name) : undefined;
  return (
    <>
      {add ? <p className={`notice ${target && target.grade !== "danger" ? "" : "notice-error"}`} role="status">
        {!target ? `${STUDIO_GATE} 지도에서 "청사진에 담기"를 누른 뒤 다시 와 주세요.`
          : target.grade === "danger" ? <><b>{target.name}</b>은(는) 위험 등급이라 청사진에 넣지 않아요.</>
          : <><b>{target.name}</b>: 아래에서 넣을 단계를 고르거나, 이 카드를 단계로 끌어 놓으세요.</>}
      </p> : null}
      {target && target.grade !== "danger" && graph.stages.length ? <AddTo graph={graph} name={target.name} onPut={(s) => put(target, s)} say={say} /> : null}
      <form className="dock-row" role="search" onSubmit={(e) => e.preventDefault()}>
        {guest ? null : <>
          <label className="tt-dim">묶기 <select value={by[0]} onChange={(e) => { const d = e.target.value as TreeDim; setDims(by[1] && by[1] !== d ? [d, by[1]] : [d]); }}>
            {DIMS.map((d) => <DimOption key={d} d={d} off={d === "tag" && tags === null} />)}</select></label>
          <label className="tt-dim">2단 <select value={by[1] ?? ""} onChange={(e) => setDims(e.target.value ? [by[0], e.target.value as TreeDim] : [by[0]])}>
            <option value="">없음</option>{secondDims(by[0]).map((d) => <DimOption key={d} d={d} off={d === "tag" && tags === null} />)}</select></label>
        </>}
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="기술 이름" aria-label="기술 이름으로 거르기" />
        <TagPick tags={tags} options={options} value={tagNow} onChange={setTag} />
      </form>
      <p className="muted">{stage ? <><b>{stage.name}</b> 단계에 맞는 기술{fields ? `(${fields.join(" · ")})` : "(직접 지은 단계라 모두)"}. </> : "캔버스에서 단계를 고르면 그 단계에 맞는 기술만 보이고 \"넣기\"가 생겨요. "}{guest ? GUEST_GATE : STUDIO_GATE}</p>
      {guest ? <PicksNote picks={guestPicks} /> : <ExtrasNote extras={extras} />}
      {tree.length ? <Tree tree={tree} stage={stage?.name ?? null} placedIn={(id) => Boolean(stage?.techs.some((x) => x.id === id))} target={target?.id ?? null}
        usage={usage} marking={marking} follow={follow} onPut={put} onCandidate={guest ? undefined : onCandidate} onUnpick={guestPicks?.remove} />
        : items.length ? <p className="muted">이 조건에 맞는 기술이 없어요.</p>
        : guest ? (found ? <p className="muted">지도에서 기술을 골라 &quot;청사진에 담기&quot;를 눌러 주세요. <Link href="/">지도 열기</Link></p> : null)
        : extras?.kind === "ok" ? <p className="muted">지도에서 &quot;청사진에 담기&quot;를 누르면 여기 나와요. <Link href="/">지도 열기</Link></p> : null}
    </>
  );
}

const DimOption = ({ d, off }: { d: TreeDim; off: boolean }) => <option value={d} disabled={off}>{off ? `${DIM_KO[d]}(못 읽음)` : DIM_KO[d]}</option>;

/** ?add= 로 온 기술을 키보드로 한 번에 넣기(P-12h-2 T3): 넣을 단계 고르기 + 넣기 */
function AddTo({ graph, name, onPut, say }: { graph: PanelProps["graph"]; name: string; onPut: (s: PanelProps["graph"]["stages"][number]) => void; say: PanelProps["say"] }) {
  const [to, setTo] = useState("");
  const s = graph.stages.find((x) => x.id === to);
  return (
    <form className="dock-row" onSubmit={(e) => { e.preventDefault(); if (s) onPut(s); else say("넣을 단계를 먼저 골라 주세요."); }}>
      <label className="tt-dim">{name}을(를) 넣을 단계 <select value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">고르기</option>{graph.stages.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <button type="submit" className="btn btn-sm" aria-disabled={s ? undefined : true}>넣기</button>
    </form>
  );
}

/** 손님 담은 목록을 읽는 중 · 못 읽음 · 공개 목록에서 빠진 것(빈 것과 다르게, 불변 2) */
function PicksNote({ picks }: { picks: PanelProps["guestPicks"] }) {
  if (!picks) return null;
  if (picks.techs === undefined) return <p className="muted" role="status">지도에서 담은 기술을 읽는 중…</p>;
  if (picks.techs === null) return <p className="notice notice-error" role="alert">지도에서 담은 기술을 불러오지 못했어요. 담은 게 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>;
  const gone = picks.ids.length - picks.techs.length;
  return gone > 0 ? <p className="muted" role="status">담은 기술 {gone}개는 지금 공개 목록에 없어 보이지 않아요.</p> : null;
}

/** 관심 · 보류를 읽는 중 · 못 읽음(빈 것과 다르게, 불변 2) */
function ExtrasNote({ extras }: { extras: TreeExtras | undefined }) {
  if (!extras) return <p className="muted" role="status">관심 · 보류를 읽는 중…</p>;
  if (extras.kind === "login") return <p className="notice notice-error" role="alert">로그인이 끝나 관심 · 보류를 읽지 못했어요. 다시 로그인해 주세요.</p>;
  if (extras.kind === "error") return <p className="notice notice-error" role="alert">관심 · 보류를 불러오지 못했어요. 판단이 없다는 뜻이 아니에요. 나머지 기술은 그대로 보여요.</p>;
  return null;
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
  marking: string | null; follow: Follow; onPut: (t: Item) => void; onCandidate?: (techId: string, name: string) => void;
  /** 손님 "목록에서 빼기" */ onUnpick?: (techId: string) => void;
};

/** 펼쳐 보이는 폴더를 위에서부터 한 줄로(키보드 이동 차례) */
type Row = { f: Folder<Item>; depth: number; parent: string | null; pos: number; size: number };
const visible = (fs: Folder<Item>[], open: Set<string>, depth = 1, parent: string | null = null): Row[] =>
  fs.flatMap((f, i) => [{ f, depth, parent, pos: i + 1, size: fs.length }, ...(open.has(f.key) ? visible(f.children, open, depth + 1, f.key) : [])]);

function Tree({ tree, stage, placedIn, target, usage, marking, follow, onPut, onCandidate, onUnpick }: TreeProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<string | null>(null);
  const [seen, setSeen] = useState<Follow>(null);
  if (follow !== seen) { // 따라갈 기술이 바뀌면 그 폴더를 펼치고 고른다(그리는 중 상태 맞추기, React 문서 방식)
    setSeen(follow);
    const path = follow ? pathTo(tree, follow.id) : [];
    if (path.length) { setSel(path[path.length - 1]); setOpen((o) => new Set([...o, ...path.slice(0, -1)])); }
  }
  useEffect(() => { // 고른 카드가 다른 폴더로 옮겨 가 초점을 잃었으면(body) 그 카드로
    if (follow?.focus && document.activeElement === document.body) document.querySelector<HTMLElement>(`.tt-cards [data-tech="${CSS.escape(follow.id)}"] button`)?.focus();
  }, [follow]);
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
            <li key={r.f.key} ref={(el) => { if (el) refs.current.set(r.f.key, el); else refs.current.delete(r.f.key); }} role="treeitem" aria-level={r.depth} aria-posinset={r.pos} aria-setsize={r.size}
              aria-selected={here} aria-expanded={has ? open.has(r.f.key) : undefined} tabIndex={here ? 0 : -1} className="tt-item" style={{ paddingLeft: `calc(var(--sp-2) + ${r.depth - 1} * var(--sp-4))` }}
              onClick={() => { setSel(r.f.key); if (has) toggle(r.f.key, !open.has(r.f.key)); }} onKeyDown={(e) => onKey(e, i)}>
              <span aria-hidden="true" className="tt-caret">{has ? (open.has(r.f.key) ? "▾" : "▸") : ""}</span>{r.f.name} <span className="muted">{r.f.count}</span>
            </li>
          );
        })}
      </ul>
      <section className="tt-cards" aria-label={`${current.name} 기술`}>
        <h3 className="dock-h">{current.path.join(" › ")} <span className="muted">{current.count}</span></h3>
        <ul className="dock-techs">{current.items.map((t) => <Card key={t.id} t={t} use={usage.get(t.id)} stage={stage} placed={placedIn(t.id)} added={t.id === target}
          busy={marking === t.id} onPut={() => onPut(t)} onCandidate={onCandidate ? () => onCandidate(t.id, t.name) : undefined} onUnpick={onUnpick ? () => onUnpick(t.id) : undefined} />)}</ul>
      </section>
    </div>
  );
}

/** 넣을 수 있는 카드(실선, 끌기 · 넣기) 또는 판단 전 카드(점선, "적용 후보로 고르기"만). 등급은 점 색만이 아니라 글자로도 */
function Card({ t, use, stage, placed, added, busy, onPut, onCandidate, onUnpick }: { t: Item; use?: TechUsage; stage: string | null; placed: boolean; added: boolean; busy: boolean; onPut: () => void; onCandidate?: () => void; onUnpick?: () => void }) {
  const risky = t.grade === "danger", can = t.droppable && !risky;
  const facts = [t.field, t.projects ? `프로젝트 ${t.projects}개` : null, use ? `확정 ${use.n}번` : null].filter(Boolean).join(" · ");
  return (
    <li data-tech={t.id} className={`dock-tech${risky ? " risky" : ""}${added ? " added" : ""}${t.droppable ? "" : " tt-out"}`} draggable={can}
      onDragStart={(e) => { if (!can) return; e.dataTransfer.setData(TECH_DRAG, t.id); e.dataTransfer.effectAllowed = "copy"; }}>
      <span className="dock-chip"><TechChip tech={t} info={t} />{t.grade !== "pass" ? <span className={`dock-grade g-${t.grade}`}>{GRADE_KO[t.grade]}</span> : null}</span>
      {facts ? <span className="muted">{facts}</span> : null}
      {t.note ? <span className="muted">{t.judgment === "hold" ? `보류 이유: ${t.note}` : t.note}</span> : null}
      {t.tags.length ? <span className="dock-tags">{t.tags.map((x) => <span key={x} className="tag">{x}</span>)}</span> : null}
      {risky ? <span className="dock-risky">✕ 위험 등급이라 넣지 않아요</span>
        : !t.droppable ? (onCandidate ? <button type="button" className="btn btn-sm" disabled={busy} /* 보내는 중: 두 번 보내지 않게 */ aria-label={busy ? undefined : `${t.name} 청사진에 담기`} onClick={onCandidate}>{busy ? "담는 중…" : "청사진에 담기"}</button> : null)
        : placed ? <span className="muted">✓ {stage}에 있어요</span>
        : stage ? <button type="button" className="btn btn-sm" onClick={onPut}>{stage}에 넣기</button> : null}
      {onUnpick ? <button type="button" className="bp-link" aria-label={`${t.name} 청사진에서 빼기`} onClick={onUnpick}>청사진에서 빼기</button> : null}
    </li>
  );
}
