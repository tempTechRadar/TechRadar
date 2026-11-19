"use client";
// 지도의 속성 카드(올렸을 때)·사이드바(눌렀을 때)·범례. 업데이트·인기 같은 정보는 지도 위가 아니라 여기서만 보인다.
import Link from "next/link";
import type { Grade, MapNode } from "@/lib/map/build-map";
import type { GroupNode, LegendItem } from "@/lib/map/layout";
import { DIM_KO, type ViewConfig } from "@/lib/map/view-config";

export const SEC: Record<Grade, { ko: string; sym: string; color: string }> = {
  danger: { ko: "위험", sym: "✕", color: "#C0262D" }, caution: { ko: "주의", sym: "!", color: "#B87600" },
  pass: { ko: "통과", sym: "✓", color: "#2f6f3a" }, unknown: { ko: "찾지 못함", sym: "?", color: "#5a5547" },
};
const fmt = (n: number | null) => (n === null ? null : n.toLocaleString("ko-KR"));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음");
const pathOf = (n: MapNode) => [n.attrs.field, n.attrs.sub, n.attrs.kind].filter((v) => v !== "분류 전").join(" › ") || "분류 전";
const hostLine = (n: MapNode) => `쓰는 곳: ${n.attrs.host}${n.hostGuessed ? "(추정)" : ""}`;

function GradeLine({ n }: { n: MapNode }) {
  const g = SEC[n.grade];
  return <span><b style={{ color: g.color }}>{g.sym} {g.ko}</b>{n.gradeReason ? ` · ${n.gradeReason}` : ""}</span>;
}

// 속성 카드(PRD-F23): 분류 경로, 등급과 이유, 마지막 업데이트와 종류, 사용량·별, 쓰는 곳, 우리가 마지막으로 확인한 시각(실패면 "수집 오류")
export function TechCard({ n, x, y }: { n: MapNode; x: number; y: number }) {
  return (
    <div className="map-card" role="tooltip" style={{ left: x, top: Math.max(8, y) }}>
      <strong>{n.name}{n.isNew ? " · NEW" : ""}</strong>
      <span className="muted">{pathOf(n)}</span>
      <GradeLine n={n} />
      <span>{n.label}{n.lastActivityKind ? ` (${n.lastActivityKind === "release" ? "릴리스" : "커밋"})` : ""}</span>
      {n.weeklyDownloads !== null || n.stars !== null ? <span>{[n.weeklyDownloads !== null && `주간 다운로드 ${fmt(n.weeklyDownloads)}`, n.stars !== null && `별 ${fmt(n.stars)}`].filter(Boolean).join(" · ")}</span> : null}
      <span className="muted">{hostLine(n)}</span>
      <span className="muted">{n.collectErrorKind ? `수집 오류(마지막 확인 ${when(n.lastCheckedOkAt)})` : `우리가 마지막으로 확인: ${when(n.lastCheckedOkAt)}`}</span>
    </div>
  );
}

export function GroupCard({ g, x, y }: { g: GroupNode; x: number; y: number }) {
  return (
    <div className="map-card" role="tooltip" style={{ left: x, top: Math.max(8, y) }}>
      <strong>{g.value}</strong>
      <span className="muted">{g.level}차 묶음 · {DIM_KO[g.dim]}</span>
      <span>기술 {g.count}{g.mine ? ` · 내 기술 ${g.mine}` : ""}</span>
      {g.danger || g.caution ? <span><b style={{ color: SEC.danger.color }}>위험 {g.danger}</b> · <b style={{ color: SEC.caution.color }}>주의 {g.caution}</b></span> : null}
    </div>
  );
}

export function TechPanel({ n, compare, onPick, onClose }: { n: MapNode; compare: MapNode[]; onPick: (k: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" className="btn map-close" onClick={onClose} aria-label="닫기">✕</button>
      <h2 id="map-side-title" tabIndex={-1}>{n.name}</h2>
      <p className="muted">{pathOf(n)}{n.isNew ? " · NEW" : ""}</p>
      <p><GradeLine n={n} /></p>
      {n.oneLiner ? <p>{n.oneLiner}</p> : null}
      <p className="muted">{n.label}{n.collectErrorKind ? ` · 마지막 확인 ${when(n.lastCheckedOkAt)}` : ""} · {hostLine(n)}</p>
      {n.mine ? <p className="muted">내 프로젝트: {n.projectNames.join(", ")}</p> : null}
      <h3>비교군 {compare.length}</h3>
      {compare.length ? (
        <ul className="map-near">{compare.map((m) => <li key={m.key}><button type="button" className="link" onClick={() => onPick(m.key)}>{SEC[m.grade].sym} {m.name}</button>{m.mine ? <span className="muted"> 내 기술</span> : null}</li>)}</ul>
      ) : <p className="muted">{n.mine ? "확정된 비교군이 없어요(외톨이). 대안을 아직 몰라요." : "없어요."}</p>}
      <p className="map-actions">
        {n.mine && n.myTechIds[0] ? <Link className="btn btn-primary" href={`/projects/tech/${n.myTechIds[0]}`}>기술 상세</Link> : null}
        {n.repoUrl ? <a className="btn" href={n.repoUrl} target="_blank" rel="noopener noreferrer">저장소 열기</a> : null}
      </p>
    </>
  );
}

export function GroupPanel({ g, members, onPick, onClose }: { g: GroupNode; members: MapNode[]; onPick: (k: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" className="btn map-close" onClick={onClose} aria-label="닫기">✕</button>
      <h2 id="map-side-title" tabIndex={-1}>{g.value}</h2>
      <p className="muted">{g.level}차 묶음 · {DIM_KO[g.dim]} · 기술 {g.count}{g.mine ? ` · 내 기술 ${g.mine}` : ""}</p>
      <ul className="map-near">{members.map((m) => (
        <li key={m.key}><button type="button" className="link" onClick={() => onPick(m.key)}>{m.name}</button>
          {m.grade === "danger" || m.grade === "caution" ? <b style={{ color: SEC[m.grade].color }}> {SEC[m.grade].sym} {SEC[m.grade].ko}</b> : null}
          {m.isNew ? <span className="muted"> NEW</span> : null}{m.mine ? <span className="muted"> 내 기술</span> : null}</li>
      ))}</ul>
    </>
  );
}

export function Legend({ items, view, mine }: { items: LegendItem[]; view: ViewConfig; mine: boolean }) {
  const shapes = ["육각형", "마름모", "네모"];
  return (
    <details className="map-legend" open>
      <summary>범례 · 색 = {DIM_KO[view.color]}</summary>
      <ul>
        {items.map((i) => <li key={i.value}><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill={i.color} /></svg>{i.value} {i.count}</li>)}
      </ul>
      <ul className="muted">
        {view.group.map((d, i) => <li key={d}>{shapes[i]} = {i + 1}차 {DIM_KO[d]}</li>)}
        <li>점 = 기술{mine ? ", 진한 테두리 = 내 기술, 옅은 점 = 비교군(점선)" : ""}</li>
        <li><b style={{ color: SEC.danger.color }}>✕</b> 위험(깜박임) · <b style={{ color: SEC.caution.color }}>!</b> 주의 · 점선 고리 = 수집 오류 · NEW = 7일 안에 들어옴</li>
      </ul>
    </details>
  );
}
