// 프로젝트 관리 보드 위젯 본문(P-12i D1): W1 숫자 4칸 · W2 판단함 · W3 레포 보드. 서버 조각이라 각자 데이터를 기다리고(Suspense = "읽는 중"),
// 못 읽으면 "읽지 못함", 비었으면 "없음"을 따로 보인다(불변 2, 안내서 "데이터 없음과 조회 실패 구분"). 보드 전체 거르기(기간 · 상태 · 프로젝트)는 주소 값을 같이 쓴다.
import Link from "next/link";
import { parseAlertFilter } from "@/lib/alerts/parse-alert-filter";
import { filterAlerts } from "@/lib/alerts/filter-alerts";
import { summarizeDashboard, type DashboardParams } from "@/lib/alerts/summarize-dashboard";
import { toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import { repoCards } from "@/lib/dashboard/status-view";
import { repoMetaLine, repoSummary, type Battery } from "@/lib/dashboard/repo-summary";
import type { MoveProgress } from "@/lib/server/board-queries";
import { RepoDrawer } from "./board-client";
import { RepoDetail } from "./widgets-more";
import { countNew, isNew } from "@/lib/dashboard/since-last-visit";
import { koreanTime } from "@/lib/flow/run-list";
import { GRADE_KO } from "@/lib/map/build-map";
import type { DashboardData } from "@/lib/server/dashboard-queries";
import type { StatusData } from "@/lib/server/status-queries";
import { registerProject } from "../projects/actions";
import { RereadButton } from "../projects/reread-button";
import { FilterSelect, PERIOD_OPTIONS } from "../alerts/filter-select";

const INBOX_LIMIT = 20; // 넘으면 알림 목록에서 모두
const AGAIN = <Link href="/dashboard">다시 불러오기</Link>;
export const Reading = ({ what }: { what: string }) => <p className="muted" role="status">{what}을(를) 읽는 중…</p>;
const Failed = ({ what }: { what: string }) => <p className="notice notice-error" role="alert"><strong>{what}을(를) 불러오지 못했어요.</strong> 없다는 뜻이 아니에요. {AGAIN}</p>;

/** 보드 전체 거르기: 지금 Numbers 폼과 같은 주소 값(period · status · project). 모든 위젯에 걸린다 */
export async function BoardFilter({ data, params }: { data: Promise<DashboardData | null>; params: DashboardParams }) {
  const d = await data;
  const projects: [string, string][] = [["", "전체"], ...(d?.projects ?? []).map((p): [string, string] => [p.id, p.name])];
  const v = (x: DashboardParams["period"]) => (typeof x === "string" ? x : undefined);
  return (
    <form className="filters board-filter" aria-label="보드 전체 거르기">
      <FilterSelect label="기간" name="period" value={v(params.period)} options={PERIOD_OPTIONS} />
      <FilterSelect label="상태" name="status" value={v(params.status)} options={[["", "전체"], ["pending", "판단 대기"], ["done", "완료"]]} />
      <FilterSelect label="프로젝트" name="project" value={v(params.project)} options={projects} />
      <button type="submit" className="btn">거르기</button>
      {d === null ? <span className="muted">프로젝트 목록을 못 읽어 프로젝트로는 거를 수 없어요.</span> : null}
    </form>
  );
}

/** W1 숫자 4칸(안내서 필수): 숫자 = 누르면 가는 목록의 수(summarizeDashboard) */
export async function NumbersBody({ data, params }: { data: Promise<DashboardData | null>; params: DashboardParams }) {
  const d = await data;
  if (!d) return <Failed what="숫자와 알림" />;
  const s = summarizeDashboard({ alerts: d.alerts, techs: d.techs, params, now: new Date() });
  const cards: [string, number, string][] = [["내 기술", s.techCount, s.links.techs], ["변경", s.changeCount, s.links.changes], ["판단 대기", s.pendingCount, s.links.pending], ["완료", s.doneCount, s.links.done]];
  return <div className="stat-grid">{cards.map(([label, value, href]) => <Link key={label} className="stat" href={href}><span className="muted">{label}</span><strong>{value}</strong></Link>)}</div>;
}

/** W2 판단함: 모든 레포의 판단 대기, 오래된 순(먼저 온 것부터), 레포 라벨, "새로 옴" */
export async function InboxBody({ alerts, params, seen }: { alerts: Promise<AlertRecord[] | null>; params: DashboardParams; seen: number | null }) {
  const all = await alerts;
  if (!all) return <Failed what="판단 대기" />;
  const pending = filterAlerts(all, { ...parseAlertFilter(params, new Date()), status: "pending" }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  if (!pending.length) return <p className="muted">판단을 기다리는 알림이 없어요{params.project || params.period ? "(거른 조건 안에서)" : ""}.</p>;
  const fresh = countNew(pending, seen);
  return (
    <>
      <p className="muted">{pending.length}건{fresh ? ` · 새로 옴 ${fresh}` : ""} · 먼저 온 것부터</p>
      <ul className="alert-list">{pending.slice(0, INBOX_LIMIT).map((r) => { const a = toAlertView(r), n = isNew(r.createdAt, seen); return (
        <li key={a.id}>
          <Link className="alert-row" href={`/alerts/${a.id}`} data-new={n ? "" : undefined}>
            <span className={`badge badge-${a.kindTone}`}>{a.kindLabel}</span>
            <span className="alert-main"><strong>{n ? <span className="tag status-new">새로 옴</span> : null}{a.title}</strong>
              <span className="muted">{r.projectName ? `레포 ${r.projectName}` : "레포 밖"}{a.subtitle ? ` · ${a.subtitle}` : ""}</span></span>
            <time className="alert-time" dateTime={a.createdAt}>{a.createdAtLabel}</time>
          </Link>
        </li>
      ); })}</ul>
      {pending.length > INBOX_LIMIT ? <p><Link href="/alerts?status=pending">판단 대기 {pending.length}건 모두 보기</Link></p> : null}
    </>
  );
}

const GRADES: [keyof Battery, string][] = [["danger", "danger"], ["caution", "warning"], ["pass", "success"], ["unknown", "neutral"]];
/** 등급 배터리(Monday Battery): 막대 하나에 위험 · 주의 · 통과 · 모름 비율, 색만이 아니라 글자로 수를 같이 */
function BatteryBar({ b }: { b: Battery }) {
  const total = b.danger + b.caution + b.pass + b.unknown;
  if (!total) return <p className="muted">등급을 볼 기술이 아직 없어요.</p>;
  return (
    <div className="battery">
      <span className="battery-bar" aria-hidden="true">{GRADES.map(([g, tone]) => (b[g] ? <i key={g} className={`battery-${tone}`} style={{ flexGrow: b[g] }} /> : null))}</span>
      <span className="battery-text">{GRADES.map(([g]) => `${GRADE_KO[g]} ${b[g]}`).join(" · ")}</span>
    </div>
  );
}

/** W3 레포 보드: 레포 카드(레포 정보 · AI 도구 구성 · 등급 배터리 · 모델 종료 · 판단 대기 · 마지막 읽기 · 수집 오류 · 다시 읽기). 이름을 누르면 레포 서랍 */
export async function ReposBody({ status, alerts, params, marks, move }: { status: Promise<StatusData | null>; alerts: Promise<AlertRecord[] | null>; params: DashboardParams;
  marks: Promise<Map<string, string> | null>; move: Promise<MoveProgress | null> }) {
  const [st, al, mk, mv] = await Promise.all([status, alerts, marks, move]);
  if (!st) return <Failed what="내 레포" />;
  const project = typeof params.project === "string" ? params.project : undefined;
  const rows = st.projects.filter((p) => !project || p.id === project);
  if (!st.projects.length) return <p className="notice notice-empty"><strong>아직 등록한 레포가 없어요.</strong> <a href="#repo-register">아래 레포 관리에서 등록하기</a></p>;
  if (!rows.length) return <p className="muted">거른 프로젝트가 없어요.</p>;
  const now = new Date(), cards = new Map(repoCards(rows, now).map((c) => [c.id, c]));
  return (
    <ul className="repo-cards">{rows.map((p) => { const c = cards.get(p.id)!, s = repoSummary(p, al), meta = repoMetaLine(p, now); return (
      <li key={p.id} className="repo-card">
        <h3><RepoDrawer name={p.name}><RepoDetail p={p} alerts={al} marks={mk} move={mv} /></RepoDrawer> <span className="muted">{p.kind === "repo" ? "레포" : "내 컴퓨터"}</span></h3>
        {meta?.error ? <p className="notice notice-error repo-meta" role="status">{meta.error}</p> : null}
        {meta?.info ? <p className="muted repo-meta">{meta.info}</p> : null}
        <p>{s.tools.length ? s.tools.map((t) => `${t.label} ${t.n}`).join(" · ") : "읽은 AI 도구가 아직 없어요"}{s.files.length ? <span className="muted"> · {s.files.join(", ")}</span> : null}</p>
        <BatteryBar b={s.battery} />
        <p>{s.pending === null ? <span className="muted">판단 대기 · 모델 종료를 못 읽었어요</span> : <>
          <Link href={`/alerts?status=pending&project=${p.id}`}>판단 대기 {s.pending}</Link>{s.modelEol ? <span className="badge badge-danger"> 모델 종료 {s.modelEol}</span> : null}</>}</p>
        <p className="muted">마지막 읽기 {c.lastReadAt ? koreanTime(c.lastReadAt) : "기록 없음"}{c.errorCount ? ` · 수집 오류 ${c.errorCount}개(지난 값)` : ""}</p>
        {c.notice ? <p className="notice notice-error" role="status">{c.notice}</p> : null}
        {p.repo_url ? <form action={registerProject} className="repo-reread"><input type="hidden" name="repoUrl" value={p.repo_url} /><RereadButton /></form> : null}
      </li>
    ); })}</ul>
  );
}

/** 로그인 전: 내 데이터 위젯 자리 */
export const LoginFirst = () => <p className="notice notice-empty"><strong>로그인하면 내 레포가 보여요.</strong> <Link href={`/login?next=${encodeURIComponent("/dashboard")}`}>로그인</Link></p>;
