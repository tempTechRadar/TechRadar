"use client";
// 청사진 스튜디오 오른쪽 속성 패널(P-12e 조각 K): 캔버스 · 목록에서 고른 단계 또는 기술을 자세히.
// 단계 = 이름 바꾸기 · 앞 / 다음 단계 · 붙은 기술(빼기) · 지우기. 기술 = 탭 개요 · 관계 · 검증 · 이력(P-12j H3, inspector-tabs.tsx) + 내 태그(TagEditor) · 사용기 상위 3개(SideNotes).
// P-12t: 하단 패널에서 누른 기술(detail)은 판에 없어도 같은 탭으로 보이고, [판에 넣기]는 끌어 놓기와 같은 길(onPlace = 관문 규칙 그대로).
// 그래프는 apply로만 바꾼다(되돌리기 · 저장은 studio).
import Link from "next/link";
import { SECTION } from "@/lib/blueprint/sections";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { STAGE_NAME_MAX } from "@/lib/blueprint/board";
import { disconnect, removeStage, removeTech, renameStage, setStageNote, STAGE_NOTE_MAX, type Stage } from "@/lib/blueprint/graph";
import { linkSaid, nameProblem, neighbors, removeSaid, renamedSaid, parallelProblem } from "@/lib/blueprint/panel-view";
import { GRADE_KO, isConcept } from "@/lib/map/build-map";
import { SideNotes } from "../tech-map/side-notes";
import { TagEditor } from "../tech-map/tag-editor";
import type { PanelProps } from "./studio-types";
import { StageChips } from "./stage-chips";
import { TechTabs } from "./inspector-tabs";
import "../tech-map/side-panel.css";
import "./inspector.css";

/** 지운 · 뺀 · 고르는 중인 단추가 사라지거나 막혀도 초점이 문서 맨 위로 떨어지지 않게 패널로 */
const focusPanel = () => document.querySelector<HTMLElement>(".insp")?.focus();
const Card = ({ title, children }: { title: ReactNode; children: ReactNode }) => <section className="side-card"><h3>{title}</h3>{children}</section>;
/** 서랍 머리 등급: 개념(작업 방식)은 등급이 없다(지도 사이드 패널과 같게, ADR 0008 2항) */
const GradeTag = ({ t }: { t: { grade: keyof typeof GRADE_KO; type: string } }) => <p className="side-tags"><span className={`tag${t.grade === "danger" || t.grade === "caution" ? ` tag-${t.grade}` : ""}`}>{isConcept(null, t.type) ? "등급 없음(작업 방식)" : `보안 ${GRADE_KO[t.grade]}`}</span></p>;

export function Inspector(p: PanelProps) {
  const stage = p.picked ? p.graph.stages.find((s) => s.id === p.picked!.stageId) : undefined;
  return (
    <aside className="insp" aria-label="속성" tabIndex={-1}>{/* 지운 뒤 초점이 문서 맨 위로 떨어지지 않게 여기로 */}
      {p.multi ? <><header className="insp-head"><h2 tabIndex={-1}>{p.multi.count}개 골랐어요</h2></header>
        <p className="muted">여럿 고른 것은 함께 옮기거나(단계만) 함께 지울 수 있어요. 하나를 고르면 자세히 보여요.</p>
        {p.multi.onGroup && p.multi.stages >= 2 ? <GroupForm stages={p.multi.stages} onGroup={p.multi.onGroup} /> : null}
        <p className="insp-row insp-actions"><button type="button" className="btn btn-sm btn-danger" onClick={p.multi.remove}>{p.multi.count}개 지우기</button></p></>
        : p.detail ? <DetailInfo key={p.detail} {...p} techId={p.detail} />
        : !p.picked || !stage ? <p className="muted">캔버스나 목록에서 단계 · 기술을 고르면 여기에 자세히 보여요.</p>
        : p.picked.kind === "tech" ? <TechInfo {...p} stageId={stage.id} techId={p.picked.techId} />
        : <StageInfo key={`${stage.id}:${stage.name}`} {...p} stageId={stage.id} />}
    </aside>
  );
}

function StageInfo({ graph, apply, onPick, pool, say, onCandidate, marking, stageId, onInsert, onBeside, onSide }: PanelProps & { stageId: string }) {
  const s = graph.stages.find((x) => x.id === stageId)!;
  const { before, after } = neighbors(graph, s.id);
  const rename = (form: FormData) => {
    const name = String(form.get("name") ?? "");
    const why = nameProblem(name);
    if (why) { say(why); return; }
    if (name.trim() !== s.name) apply(renameStage(graph, s.id, name), renamedSaid(name));
  };
  return (
    <>
      <header className="insp-head"><p className="muted">단계</p><h2 tabIndex={-1}>{s.name}</h2></header>
      <form className="insp-row" onSubmit={(e) => { e.preventDefault(); rename(new FormData(e.currentTarget)); }}>
        <label>이름 <input name="name" defaultValue={s.name} maxLength={STAGE_NAME_MAX} required /></label>
        <button type="submit" className="btn btn-sm">이름 바꾸기</button>
      </form>
      <Card title="순서">
        <Links label="앞 단계" list={before} onCut={(o) => { apply(disconnect(graph, o.id, s.id), linkSaid(graph, o.id, s.id, true)); focusPanel(); }} onInsert={onInsert ? (o) => onInsert(o.id, s.id) : undefined} />
        <Links label="다음 단계" list={after} onCut={(o) => { apply(disconnect(graph, s.id, o.id), linkSaid(graph, s.id, o.id, true)); focusPanel(); }} onInsert={onInsert ? (o) => onInsert(s.id, o.id) : undefined} />
        {onSide ? <p className="insp-row"><button type="button" className="btn btn-sm" onClick={() => onSide(s.id, -1)}>앞 단계 더하기</button><button type="button" className="btn btn-sm" onClick={() => onSide(s.id, 1)}>다음 단계 더하기</button></p> : null}
        {onBeside ? <BesideButton graph={graph} stageId={s.id} onBeside={onBeside} /> : null}
        <p className="muted">순서는 연결선이 정해요. 앞 단계가 없으면 처음, 깊이가 같으면 동시에 해요. 앞 · 다음 단계는 위 단추나, 카드 옆 점에서 선을 빈 곳으로 끌어 만들어요.</p>
      </Card>
      <NoteField graph={graph} apply={apply} stage={s} />
      <Card title={`넣은 기술 ${s.techs.length}`}>
        {s.techs.length ? <StageChips className="insp-chips" techs={s.techs} pool={pool} marking={marking} pickedTech={null}
          onPick={(id) => onPick({ kind: "tech", stageId: s.id, techId: id })} onRemove={(t) => { apply(removeTech(graph, s.id, t.id), removeSaid(s.name, t.name)); focusPanel(); }}
          onCandidate={(t) => { onCandidate(t.id, t.name); focusPanel(); }} /> : <p className="muted">아직 없어요. 하단 패널 기술 탭에서 넣어요.</p>}
      </Card>
      <p className="insp-row insp-actions">
        <button type="button" className="btn btn-sm btn-danger" onClick={(e) => { const box = e.currentTarget.closest<HTMLElement>(".insp"); onPick(null); apply(removeStage(graph, s.id), `"${s.name}" 단계를 지웠어요. 되돌리기로 살릴 수 있어요.`); box?.focus(); }}>단계 지우기</button>
      </p>
    </>
  );
}

/** 단계 메모(P-12h-2 T2): 쓰는 대로 판에 남기고(초안 저장), 되돌리기는 칸에 들어와 처음 바꾼 것만 새 칸 → 칸을 벗어나면 한 번에 되돌림 */
function NoteField({ graph, apply, stage }: Pick<PanelProps, "graph" | "apply"> & { stage: Stage }) {
  const [text, setText] = useState(stage.note ?? "");
  const typed = useRef(false), box = useRef<HTMLTextAreaElement>(null);
  // 되돌리기 · 다른 곳에서 바뀌면 칸도 따라간다(쓰는 중이 아닐 때만, 글자 사이 공백이 판에서 잘려도 칸은 그대로)
  useEffect(() => { if (document.activeElement !== box.current) setText(stage.note ?? ""); }, [stage.note]);
  return (
    <Card title="메모">
      <label className="insp-note"><span className="sr-only">{stage.name} 메모</span>
        <textarea id="insp-note" ref={box} value={text} maxLength={STAGE_NOTE_MAX} rows={3} placeholder="이 단계에서 챙길 것 · 끝났다고 볼 기준 등"
          onFocus={() => { typed.current = false; }} onBlur={() => { typed.current = false; }}
          onChange={(e) => { setText(e.target.value); apply(setStageNote(graph, stage.id, e.target.value), undefined, undefined, typed.current); typed.current = true; }} />
      </label>
      <p className="muted" aria-live="polite">{text.length}/{STAGE_NOTE_MAX}자 · 내보내기에 &quot;메모:&quot;로 들어가요. 템플릿에는 저장되지 않아요.</p>
    </Card>
  );
}

/** 고른 단계들을 섹션으로 묶기(P-12o 2단계): 이름을 받아 묶고, 섹션 머리에 기술을 끌어 놓으면 공통 기술 */
function GroupForm({ stages, onGroup }: { stages: number; onGroup: (name: string) => boolean }) {
  const [name, setName] = useState("");
  return (
    <form className="insp-row" onSubmit={(e) => { e.preventDefault(); if (onGroup(name)) setName(""); }}>
      <label>섹션 이름 <input value={name} onChange={(e) => setName(e.target.value)} maxLength={SECTION.nameMax} required placeholder="예: 백엔드 준비" /></label>
      <button type="submit" className="btn btn-sm btn-primary">단계 {stages}개를 섹션으로 묶기</button>
    </form>
  );
}

/** 같은 순서에 단계 더하기(P-12o: 카드 위 · 아래 +를 뺀 대신). 같은 순서가 가득이면 막고 이유를 글로(목록 모드와 같은 parallelProblem) */
function BesideButton({ graph, stageId, onBeside }: { graph: PanelProps["graph"]; stageId: string; onBeside: (id: string) => void }) {
  const why = parallelProblem(graph, stageId);
  return <p className="insp-row"><button type="button" className="btn btn-sm" aria-disabled={why ? true : undefined} title={why ?? undefined} onClick={() => onBeside(stageId)}>같은 순서에 단계 더하기</button>{why ? <span className="muted"> {why}</span> : null}</p>;
}

/** 앞 · 다음 단계 줄 + "끊기"(캔버스 선 위 끊기 단추의 키보드 짝, P-12h S3) */
function Links({ label, list, onCut, onInsert }: { label: string; list: Stage[]; onCut: (o: Stage) => void; onInsert?: (o: Stage) => void }) {
  if (!list.length) return <p>{label}: 없음</p>;
  return (
    <div>{label}:
      <ul className="insp-links">{list.map((o) => <li key={o.id}>{o.name} <button type="button" className="btn btn-sm btn-danger" aria-label={`${label} ${o.name} 연결 끊기`} onClick={() => onCut(o)}>끊기</button>
        {onInsert ? <button type="button" className="btn btn-sm" aria-label={`${label} ${o.name}과(와) 사이에 단계 넣기`} onClick={() => onInsert(o)}>사이에 단계 넣기</button> : null}</li>)}</ul>
    </div>
  );
}

/** 하단 패널에서 누른 기술(P-12t): 판에 있든 없든. 이름 · 등급 · 갈래 · 하는 일은 서랍 목록(내 것 · 지도 전체 · 손님 담은 것)에서, 나머지는 탭이 읽는다 */
function DetailInfo(p: PanelProps & { techId: string }) {
  const { graph, pool, catalog, guestPicks, techId, onPlace } = p;
  const t = [...pool, ...(catalog ?? []), ...(guestPicks?.techs ?? [])].find((x) => x.id === techId);
  const name = t?.name ?? "이름 모름";
  const where = graph.stages.filter((s) => s.techs.some((x) => x.id === techId));
  const [to, setTo] = useState("");
  return (
    <>
      <header className="insp-head">
        <p className="muted">하단 패널의 기술{where.length ? ` · ${where.map((s) => s.name).join(", ")}에 있음` : " · 아직 판에 없음"}</p>
        <h2 tabIndex={-1}>{name}</h2>
        {t ? <GradeTag t={t} /> : null}
        {t ? <dl className="side-facts"><dt>갈래</dt><dd>{t.sub ?? "정보 없음"}</dd><dt>하는 일</dt><dd>{t.field ?? "정보 없음"}</dd></dl> : null}
      </header>
      {graph.stages.length ? (
        <form className="insp-row" onSubmit={(e) => { e.preventDefault(); if (to) onPlace(to, techId); else p.say("넣을 단계를 먼저 골라 주세요."); }}>
          <label>넣을 단계 <select value={to} onChange={(e) => setTo(e.target.value)}><option value="">고르기</option>{graph.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <button type="submit" className="btn btn-sm" aria-disabled={to ? undefined : true}>판에 넣기</button>
        </form>
      ) : <p className="muted">단계를 먼저 만들면 여기서 판에 넣을 수 있어요.</p>}
      <TechTabs {...p} techId={techId} name={name} />
      <p className="insp-row insp-actions">
        <Link className="btn btn-sm" href={`/tech/${techId}`}>기술 상세 페이지</Link>
        <Link className="bp-link" href={`/?sel=${encodeURIComponent(`tech:${techId}`)}`}>지도에서 보기</Link>
      </p>
    </>
  );
}

function TechInfo(p: PanelProps & { stageId: string; techId: string }) {
  const { graph, apply, onPick, pool, tags, onTags, stageId, techId, guest = false } = p;
  const s = graph.stages.find((x) => x.id === stageId)!;
  const inStage = s.techs.find((t) => t.id === techId);
  const t = pool.find((x) => x.id === techId);
  const name = t?.name ?? inStage?.name ?? "이름 모름";
  const facts = t ? [t.field, t.sub, t.mark ? "담은 기술" : null, t.projects ? `프로젝트 ${t.projects}개` : null].filter(Boolean).join(" · ") : null;
  return (
    <>
      <header className="insp-head">
        <p className="muted"><button type="button" className="bp-link" onClick={() => onPick({ kind: "stage", stageId: s.id })}>{s.name}</button> 단계의 기술</p>
        <h2 tabIndex={-1}>{name}</h2>
        {t ? <GradeTag t={t} /> : null}
        {facts ? <p className="muted">{facts}</p> : null}
      </header>
      <TechTabs key={techId} {...p} techId={techId} name={name} />
      <Card title="내 태그">
        {tags === null ? <p className="notice notice-error" role="alert">내 태그를 불러오지 못했어요. 없다는 뜻이 아니에요.</p>
          : guest ? <p className="muted">로그인하면 나만 보는 태그를 붙일 수 있어요.</p>
          : <TagEditor key={techId} techId={techId} tags={tags[techId] ?? []} login onChange={(next) => onTags(techId, next)} />}
      </Card>
      {/* 손님(P-12f): 사용기 요약은 로그인 액션이라 안내만. 사용기는 기술 상세 /tech/[id]에서 로그인 없이 읽는다 */}
      <Card title="사용기"><SideNotes techId={techId} login={!guest} all={null} /></Card>
      <p className="insp-row insp-actions">
        {inStage ? <button type="button" className="btn btn-sm btn-danger" onClick={(e) => { const box = e.currentTarget.closest<HTMLElement>(".insp"); onPick({ kind: "stage", stageId: s.id }); apply(removeTech(graph, s.id, techId), removeSaid(s.name, name)); box?.focus(); }}>이 단계에서 빼기</button> : null}
        <Link className="btn btn-sm" href={`/tech/${techId}`}>기술 상세</Link>
        <Link className="bp-link" href={`/?sel=${encodeURIComponent(`tech:${techId}`)}`}>지도에서 보기</Link>
      </p>
    </>
  );
}
