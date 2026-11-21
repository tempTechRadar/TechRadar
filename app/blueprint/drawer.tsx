"use client";
// 블루프린트 왼쪽 서랍: 기술(고른 단계에 맞는 것만, 내가 자주 쓴 순) / 내 이력(확정한 블루프린트 · 자주 쓴 기술).
// 서랍 목록 = 내 기술 · 관심 · 적용 후보 · 확정에 쓴 기술. 없으면 "카탈로그에서 찾기"(서버, 공개 목록만). 위험한 기술은 넣지 못한다.
import { useState } from "react";
import type { Stage } from "@/lib/blueprint/board";
import { fitsStage, STAGE_FIELDS } from "@/lib/blueprint/knowledge";
import { HISTORY_LIMIT, type BlueprintRecord, type TechUsage } from "@/lib/blueprint/stored";
import type { PoolTech } from "@/lib/server/blueprints";
import { searchAction } from "./actions";
import type { DragTech } from "./lanes";

export type Tab = "tech" | "hist";
type Props = {
  tab: Tab; onTab: (t: Tab) => void; pool: PoolTech[]; usage: Map<string, TechUsage>; history: BlueprintRecord[] | null;
  focus: Stage | null; onFocus: (id: string | null) => void; onPut: (t: PoolTech) => void; onLoad: (h: BlueprintRecord) => void;
};
const when = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
const MARK_KO = { interest: "관심", candidate: "적용 후보" } as const;

export function Drawer(p: Props) {
  return (
    <aside className="bp-drawer" aria-label="기술 서랍과 내 이력">
      <div className="bp-tabs" role="group" aria-label="서랍 보기">
        <button type="button" className="btn bp-sm" aria-pressed={p.tab === "tech"} onClick={() => p.onTab("tech")}>기술</button>
        <button type="button" className="btn bp-sm" aria-pressed={p.tab === "hist"} onClick={() => p.onTab("hist")}>내 이력{p.history ? ` ${p.history.length}` : ""}</button>
      </div>
      {p.tab === "hist" ? <History history={p.history} usage={p.usage} pool={p.pool} onLoad={p.onLoad} /> : <TechList {...p} />}
    </aside>
  );
}

function TechList({ pool, usage, focus, onFocus, onPut }: Props) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<PoolTech[] | null | undefined>(undefined); // undefined = 안 찾음, null = 찾기 실패
  const [busy, setBusy] = useState(false);
  const term = q.trim().toLowerCase();
  const fits = (t: PoolTech) => (!focus || fitsStage(focus.name, t)) && (!term || t.name.toLowerCase().includes(term));
  const byUse = (a: PoolTech, b: PoolTech) => (usage.get(b.id)?.n ?? 0) - (usage.get(a.id)?.n ?? 0) || b.projects - a.projects || a.name.localeCompare(b.name);
  const mine = pool.filter(fits).sort(byUse);
  const more = (found ?? []).filter((t) => !pool.some((x) => x.id === t.id) && (!focus || fitsStage(focus.name, t)));
  const search = async () => { setBusy(true); setFound(await searchAction(q).catch(() => null)); setBusy(false); };
  const fields = focus ? STAGE_FIELDS[focus.name] : undefined;
  return (
    <>
      <form className="bp-row" role="search" onSubmit={(e) => { e.preventDefault(); if (!busy && term.length >= 2) void search(); }}>
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setFound(undefined); }} placeholder="기술 이름 찾기" aria-label="기술 찾기" />
        <button type="submit" className="btn bp-sm" aria-disabled={busy || term.length < 2}>{busy ? "찾는 중…" : "카탈로그에서 찾기"}</button>
      </form>
      <p className="muted">{focus ? <><b>{focus.name}</b> 단계에 맞는 기술{fields ? `(${fields.join(" · ")})` : "(직접 지은 단계라 모두)"} · <button type="button" className="bp-link" onClick={() => onFocus(null)}>모두 보기</button></>
        : "단계의 번호를 누르면 그 단계에 맞는 기술만 보여요. 기술은 단계로 끌어다 놓아요."}</p>
      <p className="sr-only" aria-live="polite">{busy ? "찾는 중이에요" : found === null ? "찾지 못했어요" : found ? `카탈로그에서 ${more.length}개 찾았어요` : ""}</p>
      <h2 className="bp-h">내 기술 · 관심 <span className="muted">{mine.length}</span></h2>
      {mine.length ? <ul className="bp-techs">{mine.map((t) => <TechItem key={t.id} t={t} use={usage.get(t.id)} focus={focus} onPut={onPut} />)}</ul>
        : <p className="muted">{pool.length ? "이 단계에 맞는 내 기술이 없어요. 위에서 카탈로그를 찾아보세요." : "아직 내 기술 · 관심이 없어요. 위에서 카탈로그를 찾아 넣어 보세요."}</p>}
      {found === null ? <p className="notice notice-error" role="alert">카탈로그를 찾지 못했어요. 기술이 없다는 뜻이 아니에요. 잠시 뒤 다시 찾아 주세요.</p> : null}
      {found ? <><h2 className="bp-h">카탈로그 <span className="muted">{more.length}</span></h2>
        {more.length ? <ul className="bp-techs">{more.map((t) => <TechItem key={t.id} t={t} focus={focus} onPut={onPut} />)}</ul> : <p className="muted">더 찾은 기술이 없어요.</p>}</> : null}
    </>
  );
}

function TechItem({ t, use, focus, onPut }: { t: PoolTech; use?: TechUsage; focus: Stage | null; onPut: (t: PoolTech) => void }) {
  const risky = t.grade === "danger";
  const drag: DragTech = { id: t.id, name: t.name, grade: t.grade };
  const tags = [t.field, t.projects ? `내 프로젝트 ${t.projects}개` : null, t.mark ? MARK_KO[t.mark] : null].filter(Boolean).join(" · ");
  return (
    <li className={`bp-tech${risky ? " risky" : ""}`} draggable={!risky} onDragStart={(e) => e.dataTransfer.setData("text/plain", `tech:${JSON.stringify(drag)}`)}>
      <span><b>{t.name}</b>{tags ? <span className="muted"> · {tags}</span> : null}</span>
      {t.oneLiner ? <span className="muted bp-one">{t.oneLiner}</span> : null}
      {use ? <span className="muted">내가 {use.n}번 씀 · 프로젝트 {use.projects}개</span> : null}
      {risky ? <span className="bp-risky">✕ 위험 등급이라 넣지 않아요</span>
        : focus ? <button type="button" className="btn bp-sm" onClick={() => onPut(t)}>{focus.name}에 넣기</button> : null}
    </li>
  );
}

function History({ history, usage, pool, onLoad }: { history: BlueprintRecord[] | null; usage: Map<string, TechUsage>; pool: PoolTech[]; onLoad: (h: BlueprintRecord) => void }) {
  if (history === null) return <p className="notice notice-error" role="alert">내 이력을 읽지 못했어요. 확정한 게 없다는 뜻이 아니에요. 판 만들기는 그대로 쓸 수 있어요.</p>;
  if (!history.length) return <p className="muted">아직 확정한 블루프린트가 없어요. 판을 만든 뒤 "이 조합으로 확정"을 누르면 여기에 쌓여요.</p>;
  const names = new Map([...pool.map((t) => [t.id, t.name] as const), ...history.flatMap((h) => h.board.flat().flatMap((s) => s.techs.map((t) => [t.id, t.name] as const)))]);
  const top = [...usage].sort((a, b) => b[1].n - a[1].n).slice(0, 15);
  return (
    <>
      <h2 className="bp-h">확정한 블루프린트 <span className="muted">{history.length}</span></h2>
      {history.length >= HISTORY_LIMIT ? <p className="muted">최근 {HISTORY_LIMIT}개만 보여요. 쓴 횟수도 이 안에서 셌어요.</p> : null}
      <ul className="bp-techs">{history.map((h) => (
        <li key={h.id} className="bp-tech">
          <span><b>{h.name}</b><span className="muted"> · {h.projectName ?? "프로젝트 없음"} · {when.format(new Date(h.createdAt))}</span></span>
          <span className="muted bp-one">{h.board.map((c) => c.map((s) => s.name).join(" + ")).join(" → ")}</span>
          <button type="button" className="btn bp-sm" onClick={() => onLoad(h)}>불러오기</button>
        </li>
      ))}</ul>
      <h2 className="bp-h">자주 쓴 기술</h2>
      {top.length ? <ul className="bp-techs">{top.map(([id, x]) => (
        <li key={id} className="bp-tech"><span><b>{names.get(id) ?? "이름 모름"}</b><span className="muted"> · {x.n}번 · 프로젝트 {x.projects}개 · {x.stages.join(", ")}</span></span></li>
      ))}</ul> : <p className="muted">확정한 블루프린트에 붙인 기술이 아직 없어요.</p>}
    </>
  );
}
