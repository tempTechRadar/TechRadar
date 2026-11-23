"use client";
// 지도 위에 덮는 사이드바(시안 radar-side.js, 11-21 사용자 결정 G): 기술은 머리(이름 + 관심 별 · 한국어 한 줄 · 기본 정보와 소속 · 배지 · 내 태그) → 위험할 때만 보안 띠 →
// 주 단추 "청사진에 담기" → 구역 카드(비교군 · 출처) → 사용기 요약. 묶음은 목록 · 이 분류만 보기 · 접기.
// P-12h U1(11-22 사용자): 관심 = 별 토글, 담기 = 적용 후보 저장(DB 그대로), 보류는 지도에서 빼고 알림 상세에서만.
import Link from "next/link";
import type { ReactNode } from "react";
import { GRADE_KO, isConcept, UNSORTED, type MapNode } from "@/lib/map/build-map";
import { describeKo } from "@/lib/map/describe";
import type { GroupItem, TechItem } from "@/lib/map/layout";
import { SideNotes } from "./side-notes";
import { TagEditor } from "./tag-editor";
import { DIM_KO } from "@/lib/map/view-config";
import "./side-panel.css";
import { listTime } from "@/lib/alerts/to-alert-view";
import { Cart, Star, type OnCartMark } from "./guest-pick";

// 위험 · 주의는 맨 위 띠로, 나머지는 출처 카드 한 줄로(평소엔 보안 구역을 길게 두지 않음)
const SEC_SHORT: Record<string, string> = { pass: "알려진 취약점 없음", unknown: "정보를 찾지 못함(위험하지 않다는 뜻이 아니에요)" };
const when = (iso: string | null) => (iso ? listTime.format(new Date(iso)) : "아직 없음"); // 알림 화면과 같은 모양(서울 시각 · 24시간제: 서버 · 브라우저가 같은 글)
const day = (iso: string) => new Date(iso).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
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
  onMark: OnCartMark; onGo: (key: string) => void; onTags: (tags: string[]) => void;
};

function TechHead({ n, star }: { n: MapNode; star: ReactNode }) {
  const [what, facts] = describeKo(n);
  // "왜 여기"(소속 · 쓰는 곳)를 기본 정보 줄과 같은 자리로(11-22 사용자)
  const where = `${pathOf(n)} · 쓰는 곳 ${n.attrs.host}${n.hostGuessed ? "(추정)" : ""}${n.mine ? ` · 프로젝트 ${n.projectNames.join(", ")}` : ""}`;
  return (
    <header className="side-head">
      <div className="side-title"><h2 id="map-side-title" tabIndex={-1}>{n.name}</h2>{star}</div>
      <p>{what}</p>
      <p className="muted">{facts ? `${facts} · ` : ""}{where}</p>
      <p className="map-row side-tags">
        <span className="tag">{n.attrs.kind}</span>
        {n.official ? <span className="tag">공식</span> : null}
        {n.isNew ? <span className="tag">NEW</span> : null}
        {n.addedAt ? <span className="tag">{day(n.addedAt)} 들어옴</span> : null}
        {n.collectErrorKind ? <span className="tag">수집 오류</span> : null}
        {n.mine ? <span className="tag strong">사용 중</span> : null}{n.nearMine ? <span className="tag">사용 중인 항목의 비교군</span> : null}
      </p>
    </header>
  );
}

function CompareList({ n, compare, onGo }: { n: MapNode; compare: Compare[]; onGo: (key: string) => void }) {
  if (!compare.length) return <p className="muted">{n.mine ? "확인된 비교군이 아직 없어요." : "비교군은 사용 중인 항목 둘레에만 보여요."}</p>;
  return (
    <ul className="map-near">{compare.map(({ item: ci, node: m, quote }) => (
      <li key={m.key}><Dot token={ci?.token ?? null} hollow={ci?.hollow} /><div>
        <button type="button" className="link" onClick={() => onGo(m.key)}>{m.name}</button>{isRisky(m) ? <span className="tag"> {GRADE_KO[m.grade]}</span> : null}
        <span className="map-why">왜: {quote ?? "근거를 아직 적지 않았어요"}</span><span className="muted">관리자 확인</span>
      </div></li>
    ))}</ul>
  );
}

/** 위험 · 주의일 때만 머리 아래 눈에 띄는 띠. 이유는 "자세히"를 펼쳐서 */
function SecurityBand({ n }: { n: MapNode & { grade: "danger" | "caution" } }) {
  return (
    <div className={`side-band side-band-${n.grade}`} role="note" aria-label="보안">
      <p><b>{n.grade === "danger" ? "✕ 보안 위험" : "! 보안 주의"}</b> {n.grade === "danger" ? "알려진 취약점이 있어요." : "확인할 점이 있어요."}</p>
      <details><summary>자세히</summary>
        <p>{n.gradeReason ?? "이유를 아직 적지 않았어요."}</p>
        {n.mine ? <p className="muted">내가 쓰는 버전 기준은 기술 상세에서 봐요.</p> : null}
      </details>
    </div>
  );
}

export function TechPanel({ item, compare, login, busy, onMark, onGo, onTags }: TechProps) {
  const n = item.node;
  const none = n.collectErrorKind ? "수집 오류로 못 읽었어요" : "아직 없음"; // 불변 2: 수집 오류를 "없음"으로 보이지 않게
  const myDetail = n.mine && n.myTechIds[0] ? `/projects/tech/${n.myTechIds[0]}` : null;
  return (
    <>
      <TechHead n={n} star={login && n.techId ? <Star status={n.mark?.status} busy={busy} onMark={onMark} /> : null} />
      <TagEditor key={n.key} techId={n.techId} tags={n.tags} login={login} onChange={onTags} facts={{ field: n.attrs.field, sub: n.attrs.sub, kind: n.attrs.kind, official: n.official }} />
      {isRisky(n) ? <SecurityBand n={n} /> : null}
      {n.collectErrorKind ? <p className="notice side-err">수집 오류: 지난번에 읽은 값을 보여 줘요(마지막 확인 {when(n.lastCheckedOkAt)}). &quot;변화 없음&quot;이 아니에요.</p> : null}
      <section className="side-decide" aria-label="청사진">
        <Cart techId={n.techId} mark={n.mark} danger={n.catalogGrade === "danger"} login={login} busy={busy} onMark={onMark} />
      </section>
      <Card title={`비교군 ${compare.length}`}><CompareList n={n} compare={compare} onGo={onGo} /></Card>
      <Card title="출처">
        {n.oneLiner ? <p>{n.oneLiner}</p> : null}
        <dl className="side-facts">
          <dt>저장소</dt><dd>{n.repoUrl ? <a href={n.repoUrl} target="_blank" rel="noopener noreferrer">저장소 열기</a> : none}</dd>
          <dt>라이선스</dt><dd>{n.license ?? none}</dd>
          <dt>활동</dt><dd>{n.label}</dd>
          <dt>마지막 확인</dt><dd>{when(n.lastCheckedOkAt)}</dd>
          {isRisky(n) ? null : <><dt>보안</dt><dd>{isConcept(null, n.type) ? "작업 방식이라 등급 없음" : `${SEC_SHORT[n.grade]}${n.gradeReason ? ` · ${n.gradeReason}` : ""}`}</dd></>}
        </dl>
      </Card>
      <Card title="사용기"><SideNotes techId={n.techId} login={login} all={myDetail} /></Card>
      <p className="map-row side-actions">
        {/* 지도의 모든 기술에 상세(17절 2차). 내 기술은 내 버전 기준 상세(카탈로그 등급이 내 버전의 위험을 가리지 않게), 나머지는 카탈로그 상세.
            로그인 전에는 로그인 뒤 그 상세로 돌아온다 */}
        {myDetail ? <Link className="btn" href={myDetail}>기술 상세</Link>
          : n.techId ? <Link className="btn" href={`/tech/${n.techId}`}>{login ? "기술 상세" : "로그인하고 기술 상세 보기"}</Link> : null}
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
        <p className="muted">{g.level}단계 · {DIM_KO[g.dim]} · {g.count}개{g.mine ? ` · 사용 중 ${g.mine}` : ""}{g.danger ? ` · 위험 ${g.danger}` : ""}{g.caution ? ` · 주의 ${g.caution}` : ""}{g.err ? ` · 수집 오류 ${g.err}` : ""}</p>
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
