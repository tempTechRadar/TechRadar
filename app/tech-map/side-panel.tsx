"use client";
// 지도 위에 덮는 사이드바(시안 radar-side.js): 기술은 머리(이름 · 한국어 한 줄 · 배지) → 내 판단 → 구역 카드(왜 여기 · 비교군 · 보안 · 출처), 묶음은 목록 · 이 분류만 보기 · 접기.
import Link from "next/link";
import type { ReactNode } from "react";
import { GRADE_KO, isConcept, UNSORTED, type MapNode, type MarkStatus } from "@/lib/map/build-map";
import { describeKo } from "@/lib/map/describe";
import type { GroupItem, TechItem } from "@/lib/map/layout";
import { Judge } from "./judge";
import { DIM_KO } from "@/lib/map/view-config";
import "./side-panel.css";

const SEC_TEXT: Record<string, string> = {
  danger: "✕ 보안 위험: 알려진 취약점이 있어요.", caution: "! 보안 주의: 확인할 점이 있어요.",
  pass: "✓ 알려진 취약점이 없어요.", unknown: "? 보안 정보를 찾지 못했어요(위험하지 않다는 뜻이 아니에요).",
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "아직 없음");
export const pathOf = (n: MapNode) => [n.attrs.field, n.attrs.sub, n.attrs.kind].filter((v) => v !== UNSORTED).join(" › ") || UNSORTED;
const isRisky = (n: MapNode): n is MapNode & { grade: "danger" | "caution" } => n.grade === "danger" || n.grade === "caution";
const Dot = ({ token, hollow }: { token: string | null; hollow?: boolean }) => (
  <i className="map-dot" aria-hidden="true" style={hollow ? { border: `2px solid var(${token ?? "--unknown"})` } : { background: `var(${token ?? "--unknown"})` }} />
);
/** 구역 카드: 없는 정보도 숨기지 않고 카드 안에서 "아직 없음"으로 말한다 */
const Card = ({ title, children }: { title: ReactNode; children: ReactNode }) => <section className="side-card"><h3>{title}</h3>{children}</section>;

type Compare = { item: TechItem | null; node: MapNode; quote: string | null };
type TechProps = {
  item: TechItem; compare: Compare[]; login: boolean; busy: boolean;
  onMark: (status: MarkStatus | null, reason: string) => void; onGo: (key: string) => void;
};

function TechHead({ n }: { n: MapNode }) {
  const [what, facts] = describeKo(n);
  return (
    <header className="side-head">
      <h2 id="map-side-title" tabIndex={-1}>{n.name}</h2>
      <p>{what}</p>
      {facts ? <p className="muted">{facts}</p> : null}
      <p className="map-row side-tags">
        <span className="tag">{n.attrs.kind}</span>
        {n.official ? <span className="tag">공식</span> : null}
        {n.isNew ? <span className="tag">NEW</span> : null}
        {isRisky(n) ? <span className={`tag tag-${n.grade}`}>보안 {GRADE_KO[n.grade]}</span> : null}
        {n.collectErrorKind ? <span className="tag">수집 오류</span> : null}
        {n.mine ? <span className="tag strong">내 기술 · 쓰는 중</span> : null}{n.nearMine ? <span className="tag">내 기술의 비교군</span> : null}
      </p>
    </header>
  );
}

function CompareList({ n, compare, onGo }: { n: MapNode; compare: Compare[]; onGo: (key: string) => void }) {
  if (!compare.length) return <p className="muted">{n.mine ? "확인된 비교군이 아직 없어요." : "비교군은 내 기술 둘레에만 보여요."}</p>;
  return (
    <ul className="map-near">{compare.map(({ item: ci, node: m, quote }) => (
      <li key={m.key}><Dot token={ci?.token ?? null} hollow={ci?.hollow} /><div>
        <button type="button" className="link" onClick={() => onGo(m.key)}>{m.name}</button>{isRisky(m) ? <span className="tag"> {GRADE_KO[m.grade]}</span> : null}
        <span className="map-why">왜: {quote ?? "근거를 아직 적지 않았어요"}</span><span className="muted">관리자 확인</span>
      </div></li>
    ))}</ul>
  );
}

export function TechPanel({ item, compare, login, busy, onMark, onGo }: TechProps) {
  const n = item.node;
  const none = n.collectErrorKind ? "수집 오류로 못 읽었어요" : "아직 없음"; // 불변 2: 수집 오류를 "없음"으로 보이지 않게
  return (
    <>
      <TechHead n={n} />
      <Judge key={`${n.key}:${n.mark?.status ?? "none"}`} techId={n.techId} grade={n.catalogGrade} mark={n.mark} login={login} busy={busy} onMark={onMark} />
      <Card title="왜 여기">
        <p>{pathOf(n)}</p>
        <p className="muted">쓰는 곳 {n.attrs.host}{n.hostGuessed ? "(추정)" : ""}{n.mine ? ` · 내 프로젝트 ${n.projectNames.join(", ")}` : ""}</p>
      </Card>
      <Card title={`비교군 ${compare.length}`}><CompareList n={n} compare={compare} onGo={onGo} /></Card>
      <Card title="보안">
        <p>{isConcept(null, n.type) ? "작업 방식이라 보안 등급이 없어요." : SEC_TEXT[n.grade]}{n.gradeReason ? ` ${n.gradeReason}` : ""}</p>
        {n.collectErrorKind ? <p className="muted">수집 오류: 지난번에 읽은 값을 보여 줘요(마지막 확인 {when(n.lastCheckedOkAt)}). &quot;변화 없음&quot;이 아니에요.</p> : null}
      </Card>
      <Card title="출처">
        {n.oneLiner ? <p>{n.oneLiner}</p> : null}
        <dl className="side-facts">
          <dt>저장소</dt><dd>{n.repoUrl ? <a href={n.repoUrl} target="_blank" rel="noopener noreferrer">저장소 열기</a> : none}</dd>
          <dt>라이선스</dt><dd>{n.license ?? none}</dd>
          <dt>활동</dt><dd>{n.label}</dd>
        </dl>
      </Card>
      <p className="map-row side-actions">
        {/* 지도의 모든 기술에 상세(17절 2차). 내 기술은 내 버전 기준 상세(카탈로그 등급이 내 버전의 위험을 가리지 않게), 나머지는 카탈로그 상세.
            로그인 전에는 로그인 뒤 그 상세로 돌아온다 */}
        {n.mine && n.myTechIds[0] ? <Link className="btn btn-primary" href={`/projects/tech/${n.myTechIds[0]}`}>기술 상세</Link>
          : n.techId ? <Link className="btn btn-primary" href={`/tech/${n.techId}`}>{login ? "기술 상세" : "로그인하고 기술 상세 보기"}</Link> : null}
      </p>
    </>
  );
}

export function GroupPanel({ g, members, shut, onDrill, onToggle, onGo }: { g: GroupItem; members: TechItem[]; shut: boolean; onDrill: () => void; onToggle: () => void; onGo: (key: string) => void }) {
  const sev = (n: MapNode) => (n.grade === "danger" ? 0 : n.grade === "caution" ? 1 : n.collectErrorKind ? 2 : 3);
  const list = [...members].sort((a, b) => sev(a.node) - sev(b.node) || (a.node.name < b.node.name ? -1 : 1));
  return (
    <>
      <header className="side-head">
        <h2 id="map-side-title" tabIndex={-1}>{g.value}</h2>
        <p className="muted">{g.level}단계 · {DIM_KO[g.dim]} · {g.count}개{g.mine ? ` · 내 기술 ${g.mine}` : ""}{g.danger ? ` · 위험 ${g.danger}` : ""}{g.caution ? ` · 주의 ${g.caution}` : ""}{g.err ? ` · 수집 오류 ${g.err}` : ""}</p>
      </header>
      <p className="map-row"><button type="button" className="btn btn-primary" onClick={onDrill}>이 분류만 보기</button><button type="button" className="btn" onClick={onToggle}>{shut ? "펼치기" : "접기"}</button></p>
      <Card title={`기술 ${list.length}${list.length > 50 ? " (위험·주의 먼저 50개)" : ""}`}>
        <ul className="map-near">{list.slice(0, 50).map((it) => (
          <li key={it.id}><Dot token={it.token} hollow={it.hollow} /><button type="button" className="link" onClick={() => onGo(it.id)}>{it.node.name}</button>
            {isRisky(it.node) ? <span className="tag">{GRADE_KO[it.node.grade]}</span> : null}
            {it.node.collectErrorKind ? <span className="tag">수집 오류</span> : null}</li>
        ))}</ul>
      </Card>
    </>
  );
}
