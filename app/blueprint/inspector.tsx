"use client";
// 청사진 스튜디오 오른쪽 속성 패널(P-12e 조각 K): 캔버스 · 목록에서 고른 단계 또는 기술을 자세히.
// 단계 = 이름 바꾸기 · 앞 / 다음 단계 · 붙은 기술(빼기) · 지우기. 기술 = 등급 · 보안 띠 · 내 태그(TagEditor) · 사용기 상위 3개(SideNotes) — 지도 사이드 패널 구획을 그대로 씀.
// 그래프는 apply로만 바꾼다(되돌리기 · 저장은 studio).
import Link from "next/link";
import type { ReactNode } from "react";
import { removeStage, removeTech, renameStage, type Graph } from "@/lib/blueprint/graph";
import { nameProblem, neighbors } from "@/lib/blueprint/panel-view";
import { GRADE_KO } from "@/lib/map/build-map";
import type { PoolTech } from "@/lib/server/blueprints";
import { SideNotes } from "../tech-map/side-notes";
import { TagEditor } from "../tech-map/tag-editor";
import type { PanelProps } from "./studio-types";
import "../tech-map/side-panel.css";
import "./inspector.css";

// 보안 띠 문구: 지도 사이드 패널(app/tech-map/side-panel.tsx SEC_TEXT)과 같은 말. 그쪽은 지도 점(MapNode) 전용이라 글만 옮겨 옴 — 바꾸면 둘 다
const SEC_TEXT: Record<PoolTech["grade"], string> = {
  danger: "✕ 보안 위험: 알려진 취약점이 있어요.", caution: "! 보안 주의: 확인할 점이 있어요.",
  pass: "✓ 알려진 취약점이 없어요.", unknown: "? 보안 정보를 찾지 못했어요(위험하지 않다는 뜻이 아니에요).",
};
const Card = ({ title, children }: { title: ReactNode; children: ReactNode }) => <section className="side-card"><h3>{title}</h3>{children}</section>;

export function Inspector(p: PanelProps) {
  const stage = p.picked ? p.graph.stages.find((s) => s.id === p.picked!.stageId) : undefined;
  return (
    <aside className="insp" aria-label="속성">
      {!p.picked || !stage ? <p className="muted">캔버스나 목록에서 단계 · 기술을 고르면 여기에 자세히 보여요.</p>
        : p.picked.kind === "tech" ? <TechInfo {...p} stageId={stage.id} techId={p.picked.techId} />
        : <StageInfo key={stage.id} {...p} stageId={stage.id} />}
    </aside>
  );
}

function StageInfo({ graph, apply, onPick, say, stageId }: PanelProps & { stageId: string }) {
  const s = graph.stages.find((x) => x.id === stageId)!;
  const { before, after } = neighbors(graph, s.id);
  const names = (list: Graph["stages"]) => (list.length ? list.map((x) => x.name).join(", ") : "없음");
  const rename = (form: FormData) => {
    const name = String(form.get("name") ?? "");
    const why = nameProblem(name);
    if (why) { say(why); return; }
    apply(renameStage(graph, s.id, name), `단계 이름을 "${name.trim()}"(으)로 바꿨어요.`);
  };
  return (
    <>
      <header className="insp-head"><p className="muted">단계</p><h2 tabIndex={-1}>{s.name}</h2></header>
      <form className="insp-row" onSubmit={(e) => { e.preventDefault(); rename(new FormData(e.currentTarget)); }}>
        <label>이름 <input name="name" defaultValue={s.name} maxLength={20} required /></label>
        <button type="submit" className="btn insp-sm">바꾸기</button>
      </form>
      <Card title="순서">
        <p>앞 단계: {names(before)}</p>
        <p>다음 단계: {names(after)}</p>
        <p className="muted">순서는 연결선이 정해요. 앞 단계가 없으면 처음, 깊이가 같으면 동시에 해요.</p>
      </Card>
      <Card title={`붙은 기술 ${s.techs.length}`}>
        {s.techs.length ? <ul className="insp-list">{s.techs.map((t) => (
          <li key={t.id}>
            <button type="button" className="insp-link" onClick={() => onPick({ kind: "tech", stageId: s.id, techId: t.id })}>{t.name}</button>
            <button type="button" className="btn insp-sm" aria-label={`${t.name} 빼기`} onClick={() => apply(removeTech(graph, s.id, t.id), `${s.name}에서 ${t.name}을(를) 뺐어요.`)}>빼기</button>
          </li>
        ))}</ul> : <p className="muted">아직 없어요. 하단 패널 기술 탭에서 넣어요.</p>}
      </Card>
      <p className="insp-row insp-actions">
        <button type="button" className="btn insp-sm" onClick={() => { onPick(null); apply(removeStage(graph, s.id), `"${s.name}" 단계를 지웠어요. 되돌리기로 살릴 수 있어요.`); }}>단계 지우기</button>
      </p>
    </>
  );
}

function TechInfo({ graph, apply, onPick, pool, tags, onTags, stageId, techId }: PanelProps & { stageId: string; techId: string }) {
  const s = graph.stages.find((x) => x.id === stageId)!;
  const inStage = s.techs.find((t) => t.id === techId);
  const t = pool.find((x) => x.id === techId);
  const name = t?.name ?? inStage?.name ?? "이름 모름";
  const facts = t ? [t.field, t.sub, t.mark ? "적용 후보" : null, t.projects ? `내 프로젝트 ${t.projects}개` : null].filter(Boolean).join(" · ") : null;
  return (
    <>
      <header className="insp-head">
        <p className="muted"><button type="button" className="insp-link" onClick={() => onPick({ kind: "stage", stageId: s.id })}>{s.name}</button> 단계의 기술</p>
        <h2 tabIndex={-1}>{name}</h2>
        {t ? <p className="side-tags"><span className={`tag${t.grade === "danger" || t.grade === "caution" ? ` tag-${t.grade}` : ""}`}>보안 {GRADE_KO[t.grade]}</span></p> : null}
        {t?.oneLiner ? <p>{t.oneLiner}</p> : null}
        {facts ? <p className="muted">{facts}</p> : null}
      </header>
      {/* 서랍 밖 기술: 이력에서 불러온 판의 기술은 내 기술 · 적용 후보가 아닐 수 있어 등급을 모른다(모르는 것을 "통과"로 보이지 않게, 불변 2) */}
      <Card title="보안">{t ? <p>{SEC_TEXT[t.grade]}</p> : <p className="muted">내 기술 · 적용 후보가 아니라 등급을 여기서 읽지 않았어요. 기술 상세에서 보세요.</p>}</Card>
      <Card title="내 태그">
        {tags === null ? <p className="notice notice-error" role="alert">내 태그를 읽지 못했어요. 없다는 뜻이 아니에요.</p>
          : <TagEditor key={techId} techId={techId} tags={tags[techId] ?? []} login onChange={(next) => onTags(techId, next)} />}
      </Card>
      <Card title="사용기"><SideNotes techId={techId} login all={null} /></Card>
      <p className="insp-row insp-actions">
        {inStage ? <button type="button" className="btn insp-sm" onClick={() => { onPick({ kind: "stage", stageId: s.id }); apply(removeTech(graph, s.id, techId), `${s.name}에서 ${name}을(를) 뺐어요.`); }}>이 단계에서 빼기</button> : null}
        <Link className="btn insp-sm" href={`/tech/${techId}`}>기술 상세</Link>
        <Link className="insp-link" href={`/?sel=${encodeURIComponent(`tech:${techId}`)}`}>지도에서 보기</Link>
      </p>
    </>
  );
}
