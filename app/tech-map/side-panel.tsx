"use client";
// 지도 위에 덮는 사이드바(시안 radar-side.js): 기술은 설명 · 보안 · 비교군과 그 이유 · 내 판단 바로 남기기, 묶음은 목록 · 이 분류만 보기 · 접기.
import Link from "next/link";
import { GRADE_KO, isConcept, type MapNode, type MarkStatus } from "@/lib/map/build-map";
import type { GroupItem, TechItem } from "@/lib/map/layout";
import { Judge } from "./judge";
import { DIM_KO } from "@/lib/map/view-config";

const SEC_TEXT: Record<string, string> = {
  danger: "✕ 보안 위험: 알려진 취약점이 있어요.", caution: "! 보안 주의: 확인할 점이 있어요.",
  pass: "✓ 알려진 취약점이 없어요.", unknown: "? 보안 정보를 찾지 못했어요(위험하지 않다는 뜻이 아니에요).",
};
const fmt = (n: number | null) => (n === null ? null : n.toLocaleString("ko-KR"));
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음");
export const pathOf = (n: MapNode) => [n.attrs.field, n.attrs.sub, n.attrs.kind].filter((v) => v !== "분류 전").join(" › ") || "분류 전";
const Dot = ({ token, hollow }: { token: string | null; hollow?: boolean }) => (
  <i className="map-dot" aria-hidden="true" style={hollow ? { border: `2px solid var(${token ?? "--unknown"})` } : { background: `var(${token ?? "--unknown"})` }} />
);

type Compare = { item: TechItem | null; node: MapNode; quote: string | null };
type TechProps = {
  item: TechItem; compare: Compare[]; login: boolean; busy: boolean;
  onMark: (status: MarkStatus | null, reason: string) => void; onGo: (key: string) => void;
};

export function TechPanel({ item, compare, login, busy, onMark, onGo }: TechProps) {
  const n = item.node;
  return (
    <>
      <h2 id="map-side-title" tabIndex={-1}>{n.name}</h2>
      <p className="muted">{pathOf(n)}</p>
      <p className="map-row">{n.isNew ? <span className="tag">NEW</span> : null}{n.mine ? <span className="tag strong">내 기술 · 쓰는 중</span> : null}{n.nearMine ? <span className="tag">내 기술의 비교군</span> : null}</p>
      {n.oneLiner ? <p>{n.oneLiner}</p> : null}
      <p className="muted">{[n.label, n.weeklyDownloads !== null && `주간 내려받기 ${fmt(n.weeklyDownloads)}`, n.stars !== null && `별 ${fmt(n.stars)}`].filter(Boolean).join(" · ")}</p>
      <p>{isConcept(null, n.type) ? "작업 방식이라 보안 등급이 없어요." : SEC_TEXT[n.grade]}{n.gradeReason ? ` ${n.gradeReason}` : ""}</p>
      {n.collectErrorKind ? <p className="muted">수집 오류: 지난번에 읽은 값을 보여 줘요(마지막 확인 {when(n.lastCheckedOkAt)}). &quot;변화 없음&quot;이 아니에요.</p> : null}
      <p className="muted">출처: {n.repoUrl ? <a href={n.repoUrl} target="_blank" rel="noopener noreferrer">저장소</a> : "저장소 찾지 못함"} · 라이선스 {n.license ?? "찾지 못함"} · 쓰는 곳 {n.attrs.host}{n.hostGuessed ? "(추정)" : ""}</p>
      {n.mine ? <p className="muted">내 프로젝트: {n.projectNames.join(", ")}</p> : null}
      <h3>내 판단</h3>
      <Judge key={`${n.key}:${n.mark?.status ?? "none"}`} techId={n.techId} grade={n.catalogGrade} mark={n.mark} login={login} busy={busy} onMark={onMark} />
      <h3>비교군 {compare.length}</h3>
      {compare.length ? (
        <ul className="map-near">{compare.map(({ item: ci, node: m, quote }) => (
          <li key={m.key}><Dot token={ci?.token ?? null} hollow={ci?.hollow} /><div>
            <button type="button" className="link" onClick={() => onGo(m.key)}>{m.name}</button>{m.grade === "danger" || m.grade === "caution" ? <span className="tag"> {GRADE_KO[m.grade]}</span> : null}
            <span className="map-why">왜: {quote ?? "근거를 아직 적지 않았어요"}</span><span className="muted">관리자 확인</span>
          </div></li>
        ))}</ul>
      ) : <p className="muted">{n.mine ? "확인된 비교군이 아직 없어요." : "비교군은 내 기술 둘레에만 보여요."}</p>}
      <p className="map-row">
        {n.mine && n.myTechIds[0] ? <Link className="btn btn-primary" href={`/projects/tech/${n.myTechIds[0]}`}>기술 상세</Link> : null}
        {n.repoUrl ? <a className="btn" href={n.repoUrl} target="_blank" rel="noopener noreferrer">저장소 열기</a> : null}
      </p>
    </>
  );
}

export function GroupPanel({ g, members, shut, onDrill, onToggle, onGo }: { g: GroupItem; members: TechItem[]; shut: boolean; onDrill: () => void; onToggle: () => void; onGo: (key: string) => void }) {
  const sev = (n: MapNode) => (n.grade === "danger" ? 0 : n.grade === "caution" ? 1 : n.collectErrorKind ? 2 : 3);
  const list = [...members].sort((a, b) => sev(a.node) - sev(b.node) || (a.node.name < b.node.name ? -1 : 1));
  return (
    <>
      <h2 id="map-side-title" tabIndex={-1}>{g.value}</h2>
      <p className="muted">{g.level}단계 · {DIM_KO[g.dim]} · {g.count}개{g.mine ? ` · 내 기술 ${g.mine}` : ""}{g.danger ? ` · 위험 ${g.danger}` : ""}{g.caution ? ` · 주의 ${g.caution}` : ""}{g.err ? ` · 수집 오류 ${g.err}` : ""}</p>
      <p className="map-row"><button type="button" className="btn btn-primary" onClick={onDrill}>이 분류만 보기</button><button type="button" className="btn" onClick={onToggle}>{shut ? "펼치기" : "접기"}</button></p>
      <h3>기술 {list.length}{list.length > 50 ? " (위험·주의 먼저 50개)" : ""}</h3>
      <ul className="map-near">{list.slice(0, 50).map((it) => (
        <li key={it.id}><Dot token={it.token} hollow={it.hollow} /><button type="button" className="link" onClick={() => onGo(it.id)}>{it.node.name}</button>
          {it.node.grade === "danger" || it.node.grade === "caution" ? <span className="tag">{GRADE_KO[it.node.grade]}</span> : null}
          {it.node.collectErrorKind ? <span className="tag">수집 오류</span> : null}</li>
      ))}</ul>
    </>
  );
}
