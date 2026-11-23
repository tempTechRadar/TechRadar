// 프로젝트 관리 보드 위젯 본문 D2(P-12i): W4 바뀐 것 · W5 옮기기 진행 · W6 점검한 비율 · W7 소식 · W8 요즘 뜨는 대안 · W9 기록 찾기 · 레포 서랍 표.
// 각자 데이터를 기다리고(Suspense = 읽는 중) 못 읽으면 "읽지 못함", 비었으면 "없음"(불변 2). 보드 전체 거르기(기간 · 상태 · 프로젝트)를 따른다.
import Link from "next/link";
import { parseAlertFilter } from "@/lib/alerts/parse-alert-filter";
import { filterAlerts } from "@/lib/alerts/filter-alerts";
import { findReviewDue } from "@/lib/alerts/find-review-due";
import type { DashboardParams } from "@/lib/alerts/summarize-dashboard";
import { toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import { checkedRatio, weeklyChanges } from "@/lib/dashboard/board-stats";
import type { StatusProjectRow } from "@/lib/dashboard/status-view";
import type { Trending } from "@/lib/domain/trending";
import { koreanTime } from "@/lib/flow/run-list";
import { GRADE_KO, isConcept, KIND_KO, MANUAL_KIND } from "@/lib/map/build-map";
import type { MarkEventRow, MoveProgress } from "@/lib/server/board-queries";
import type { NewsFeedResult } from "@/lib/server/news-feed";
import type { StatusData } from "@/lib/server/status-queries";
import { NewsTab } from "./news-tab";
import { ViewToggle } from "./board-client";

const AGAIN = <Link href="/dashboard">다시 불러오기</Link>;
const Failed = ({ what }: { what: string }) => <p className="notice notice-error" role="alert"><strong>{what}을(를) 불러오지 못했어요.</strong> 없다는 뜻이 아니에요. {AGAIN}</p>;
const KIND = { security: "보안 경고", opportunity: "적용 기회", model_eol: "모델 종료" } as const;
const TONE = { danger: "danger", caution: "warning", unknown: "neutral", pass: "success" } as const;
const MARK_KO: Record<string, string> = { candidate: "담음", interest: "★ 관심", hold: "보류" };
const project = (p: DashboardParams) => (typeof p.project === "string" && p.project ? p.project : undefined);
const day = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

/** W4 바뀐 것: 등급 하락(보안 경고) · 같은 역할 새 기술(적용 기회) · 모델 종료. 지금 = 최근 것 목록, 추이 = 주별 수 */
export async function ChangesBody({ alerts, params }: { alerts: Promise<AlertRecord[] | null>; params: DashboardParams }) {
  const all = await alerts;
  if (!all) return <Failed what="바뀐 것" />;
  const now = new Date(), shown = filterAlerts(all, parseAlertFilter(params, now));
  const recent = [...shown].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 8);
  const weeks = weeklyChanges(shown, now);
  const nowView = recent.length ? (
    <ul className="board-list">{recent.map((r) => { const a = toAlertView(r); return (
      <li key={a.id}><span className={`badge badge-${a.kindTone}`}>{a.kindLabel}</span> <Link href={`/alerts/${a.id}`}>{a.title}</Link> <span className="muted">{a.createdAtLabel}</span></li>
    ); })}</ul>
  ) : <p className="muted">거른 조건 안에서 바뀐 것이 없어요.</p>;
  const trend = (
    <table className="board-table"><caption className="sr-only">주별 바뀐 것</caption>
      <thead><tr><th scope="col">주(시작일)</th>{Object.values(KIND).map((k) => <th key={k} scope="col">{k}</th>)}<th scope="col">합계</th></tr></thead>
      <tbody>{weeks.map((w) => <tr key={w.from}><th scope="row">{day.format(new Date(w.from))}~</th><td>{w.security}</td><td>{w.opportunity}</td><td>{w.model_eol}</td><td><b>{w.total}</b></td></tr>)}</tbody>
    </table>
  );
  return <><p className="muted">최근 7일 {weeks.at(-1)?.total ?? 0}건 · <Link href="/alerts?period=7d">알림에서 보기</Link></p><ViewToggle now={nowView} trend={trend} /></>;
}

/** W5 옮기기 진행: 담은 기술 → 확정한 청사진(레포별) → 내보내기. 이어진 막대 */
export async function MoveBody({ move, status, params }: { move: Promise<MoveProgress | null>; status: Promise<StatusData | null>; params: DashboardParams }) {
  const [m, st] = await Promise.all([move, status]);
  if (!m) return <Failed what="옮기기 진행" />;
  const pid = project(params), bps = m.blueprints.filter((b) => !pid || b.projectId === pid);
  const names = new Map((st?.projects ?? []).map((p) => [p.id, p.name]));
  const byRepo = [...bps.reduce((acc, b) => acc.set(b.projectId ?? "", (acc.get(b.projectId ?? "") ?? 0) + 1), new Map<string, number>())];
  const steps: [string, number, string][] = [["담은 기술", m.candidates, "/blueprint"], ["확정한 청사진", bps.length, "/blueprint"], ["내보내기", m.exports, "/projects/install"]];
  return (
    <>
      <ol className="move-steps">{steps.map(([label, n, href]) => <li key={label} data-done={n ? "" : undefined}><Link href={href}><b>{n}</b> {label}</Link></li>)}</ol>
      {pid ? <p className="muted">담은 기술 · 내보내기는 사람별이라 프로젝트로 거르지 않아요.</p> : null}
      {byRepo.length ? <ul className="board-list">{byRepo.map(([id, n]) => <li key={id}>{id ? names.get(id) ?? "보관한 레포" : "프로젝트 없이"} · 청사진 {n}개</li>)}</ul>
        : <p className="muted">아직 확정한 청사진이 없어요. <Link href="/blueprint">청사진에서 확정하기</Link></p>}
    </>
  );
}

/** W6 점검한 비율(주요 지표): 내 기술 중 등급 · 이유를 본 비율, 안 본 것 바로가기(기술 상세를 열면 본 것으로 남음) */
export async function CheckedBody({ status, viewed, params }: { status: Promise<StatusData | null>; viewed: Promise<Set<string> | null>; params: DashboardParams }) {
  const [st, v] = await Promise.all([status, viewed]);
  if (!st || !v) return <Failed what="점검한 비율" />;
  const pid = project(params);
  const techs = st.projects.filter((p) => !pid || p.id === pid).flatMap((p) => p.my_technologies.filter((t) => !t.hidden_at)
    .map((t) => ({ techId: t.tech_id, myTechId: t.id, name: t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", concept: isConcept(t.technologies?.tech_key, t.technologies?.type) })));
  const r = checkedRatio(techs, v);
  if (r.ratio === null) return <p className="muted">등급을 볼 기술이 아직 없어요.</p>;
  const pct = Math.round(r.ratio * 100);
  return (
    <>
      <p><b className="board-big">{pct}%</b> 내 기술 {r.total}개 중 {r.checked}개의 등급 · 이유를 봤어요.</p>
      <span className="battery-bar" aria-hidden="true"><i className="battery-success" style={{ flexGrow: r.checked }} /><i className="battery-neutral" style={{ flexGrow: r.total - r.checked }} /></span>
      {r.unchecked.length ? <><p className="muted">아직 안 본 것</p><ul className="board-list">{r.unchecked.slice(0, 5).map((u) => <li key={u.techId}><Link href={`/projects/tech/${u.myTechId}`}>{u.name}</Link></li>)}</ul></> : <p className="muted">모두 봤어요.</p>}
    </>
  );
}

/** W7 소식 */
export async function NewsBody({ feed }: { feed: Promise<NewsFeedResult | null | "preview"> }) {
  return <NewsTab feed={await feed} />;
}

/** W8 요즘 뜨는 대안: 내 기술과 같은 갈래에서 뜨는 것(없으면 전체), 지도에서 보고 담기. same null = 로그인 전(전체에서) */
export async function TrendingBody({ trend }: { trend: Promise<{ items: Trending[]; same: boolean | null } | null> }) {
  const t = await trend;
  if (!t) return <Failed what="요즘 뜨는 대안" />;
  if (!t.items.length) return <p className="muted">최근 7일에 뜬 기술이 없어요. <Link href="/recommend">추천 보기</Link></p>;
  return (
    <>
      <p className="muted">{t.same === null ? "최근 7일에 뜬 것(로그인하면 내 기술과 같은 갈래로)" : t.same ? "내 기술과 같은 갈래에서 뜨는 것" : "내 기술과 같은 갈래에는 없어 전체에서 뜨는 것"} · 지도에서 보고 &quot;청사진에 담기&quot;</p>
      <ul className="board-list">{t.items.map((x) => (
        <li key={x.id}><Link href={`/?sel=${encodeURIComponent(`tech:${x.id}`)}`}>{x.name}</Link> <span className="muted">{x.reasons.map((r) => (r.kind === "stars" ? `별 +${r.gain}` : `HN ${r.points}점`)).join(" · ")}</span></li>
      ))}</ul>
      <p><Link href="/recommend">추천 보기</Link></p>
    </>
  );
}

/** W9 기록 찾기: 찾기 칸(→ /history) · 최근 판단 · 최근 담기 기록 · 다시 볼 보류 */
export async function HistoryBody({ alerts, marks }: { alerts: Promise<AlertRecord[] | null>; marks: Promise<MarkEventRow[] | null> }) {
  const [al, mk] = await Promise.all([alerts, marks]);
  const judged = (al ?? []).filter((a) => a.judgment).sort((a, b) => Date.parse(b.judgment!.judgedAt) - Date.parse(a.judgment!.judgedAt)).slice(0, 5);
  const review = al ? findReviewDue(al, new Date()) : [];
  return (
    <>
      <form action="/history" className="board-search" role="search"><label>기록 찾기 <input name="q" type="search" placeholder="예: mcp-remote, 고친 버전" /></label><button type="submit" className="btn btn-sm">찾기</button></form>
      {!al ? <Failed what="최근 판단" /> : judged.length ? <><p className="muted">최근 판단</p><ul className="board-list">{judged.map((a) => (
        <li key={a.id}><span className="badge badge-neutral">{a.judgment!.decision === "candidate" ? "적용 후보" : "보류"}</span> <Link href={`/alerts/${a.id}`}>{toAlertView(a).title}</Link></li>
      ))}</ul></> : <p className="muted">아직 판단한 알림이 없어요.</p>}
      {!mk ? <Failed what="담기 기록" /> : mk.length ? <><p className="muted">최근 담기 · 관심 · 보류</p><ul className="board-list">{mk.map((e) => (
        <li key={e.id}>{e.name} <span className="muted">{e.status ? MARK_KO[e.status] ?? e.status : "표시 지움"} · {koreanTime(e.createdAt)}</span></li>
      ))}</ul></> : null}
      {review.length ? <p><Link href="/history?decision=hold">보류한 지 30일 지난 판단 {review.length}건 다시 보기</Link></p> : null}
      <p><Link href="/history">일지 전체 보기</Link></p>
    </>
  );
}

/** 레포 서랍 본문: 그 레포의 내 기술 표(이름 · 종류 · 출처 파일 · 등급 · 판단 상태 · 최근 바뀜 · 마지막 확인) + 확정 청사진 */
export function RepoDetail({ p, alerts, marks, move }: { p: StatusProjectRow; alerts: AlertRecord[] | null; marks: Map<string, string> | null; move: MoveProgress | null }) {
  const techs = p.my_technologies.filter((t) => !t.hidden_at);
  const changed = new Map<string, string>();
  for (const a of alerts ?? []) if (a.myTechnologyId && (!changed.has(a.myTechnologyId) || Date.parse(a.createdAt) > Date.parse(changed.get(a.myTechnologyId)!))) changed.set(a.myTechnologyId, a.createdAt);
  const bps = move?.blueprints.filter((b) => b.projectId === p.id) ?? null;
  return (
    <>
      {techs.length ? (
        <table className="board-table repo-table"><caption className="sr-only">{p.name}의 내 기술</caption>
          <thead><tr><th scope="col">이름</th><th scope="col">종류</th><th scope="col">출처 파일</th><th scope="col">등급</th><th scope="col">판단</th><th scope="col">최근 바뀜</th><th scope="col">마지막 확인</th></tr></thead>
          <tbody>{techs.map((t) => { const concept = isConcept(t.technologies?.tech_key, t.technologies?.type), type = t.technologies?.type; return (
            <tr key={t.id}>
              <th scope="row"><Link href={`/projects/tech/${t.id}`}>{t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)"}</Link></th>
              <td>{type ? KIND_KO[type] ?? type : MANUAL_KIND}</td>
              <td>{t.source_file ?? "-"}</td>
              <td>{concept ? <span className="badge badge-neutral">등급 없음</span> : <span className={`badge badge-${TONE[t.grade]}`}>{GRADE_KO[t.grade]}</span>}{t.collect_error_kind ? <span className="muted"> 수집 오류</span> : null}</td>
              <td>{marks === null ? "못 읽음" : t.tech_id ? MARK_KO[marks.get(t.tech_id) ?? ""] ?? "-" : "-"}</td>
              <td>{alerts === null ? "못 읽음" : changed.has(t.id) ? koreanTime(changed.get(t.id)!) : "-"}</td>
              <td>{t.read_at ? koreanTime(t.read_at) : "기록 없음"}</td>
            </tr>
          ); })}</tbody>
        </table>
      ) : <p className="muted">이 레포에서 읽은 기술이 아직 없어요.</p>}
      <h3 className="repo-drawer-h">확정한 청사진</h3>
      {bps === null ? <Failed what="확정한 청사진" /> : bps.length ? <ul className="board-list">{bps.map((b) => <li key={b.id}>{b.name} <span className="muted">{koreanTime(b.createdAt)}</span></li>)}</ul>
        : <p className="muted">이 레포로 확정한 청사진이 없어요. <Link href="/blueprint">청사진 열기</Link></p>}
    </>
  );
}
