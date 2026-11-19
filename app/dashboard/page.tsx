import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buildFirstCheckBand, FIRST_CHECK_COOKIE, parseSeenRunIds } from "@/lib/alerts/first-check-band";
import { readRecentFirstReads } from "@/lib/server/first-check-queries";
import { FirstCheckBanner } from "./first-check-banner";
import { FilterSelect, PERIOD_OPTIONS } from "../alerts/filter-select";
import { countRecentChanges } from "@/lib/alerts/count-recent-changes";
import { findReviewDue } from "@/lib/alerts/find-review-due";
import { summarizeDashboard } from "@/lib/alerts/summarize-dashboard";
import { toAlertView } from "@/lib/alerts/to-alert-view";
import { readDashboardData } from "@/lib/server/dashboard-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { ReviewCard, WeekCard } from "./extra-cards";
import "../alerts/alerts.css";

// 대시보드(IA-5, PRD-F22). 숫자는 모든 프로젝트 합계이고, 누르면 같은 조건의 목록으로 간다.
type Params = { status?: string; period?: string; project?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const supabase = (await getServerSupabase())!;
  const data = await readDashboardData(supabase, user.id).catch((e) => { console.error("대시보드 조회 실패", e); return null; });
  const seen = parseSeenRunIds((await cookies()).get(FIRST_CHECK_COOKIE)?.value);
  // 띠를 못 읽어도 대시보드는 그대로 보여 준다(띠는 덧붙이는 요약이라 숫자를 단정하지 않고 숨길 뿐, 로그는 남김)
  const band = await readRecentFirstReads(supabase, user.id).then((runs) => buildFirstCheckBand(runs, seen)).catch((e) => { console.error("첫 점검 띠 조회 실패", e); return null; });

  return (
    <main className="alerts">
      <h1>대시보드</h1>
      {band ? <FirstCheckBanner band={band} /> : null}
      {data === null ? <LoadError /> : data.techs.length === 0 && data.alerts.length === 0 ? <Empty /> : <Board data={data} params={params} />}
    </main>
  );
}

function Board({ data, params }: { data: NonNullable<Awaited<ReturnType<typeof readDashboardData>>>; params: Params }) {
  const now = new Date();
  const summary = summarizeDashboard({ alerts: data.alerts, techs: data.techs, params, now });
  const projectOptions: [string, string][] = [["", "전체"], ...data.projects.map((p): [string, string] => [p.id, p.name])];
  const cards: [string, number, string][] = [
    ["내 기술", summary.techCount, summary.links.techs],
    ["변경", summary.changeCount, summary.links.changes],
    ["판단 대기", summary.pendingCount, summary.links.pending],
    ["완료", summary.doneCount, summary.links.done],
  ];
  return (
    <>
      <form className="filters" aria-label="대시보드 거르기">
        <FilterSelect label="기간" name="period" value={params.period} options={PERIOD_OPTIONS} />
        <FilterSelect label="상태" name="status" value={params.status} options={[["", "전체"], ["pending", "판단 대기"], ["done", "완료"]]} />
        <FilterSelect label="프로젝트" name="project" value={params.project} options={projectOptions} />
        <button type="submit" className="btn">거르기</button>
      </form>
      <div className="stat-grid">
        {cards.map(([label, value, href]) => (
          <Link key={label} className="stat" href={href}><span className="muted">{label}</span><strong>{value}</strong></Link>
        ))}
      </div>
      <WeekCard count={countRecentChanges(data.alerts, now)} />
      <ReviewCard items={findReviewDue(data.alerts, now)} />
      <h2>최근 변경</h2>
      {summary.recent.length === 0 ? (
        <div className="notice notice-empty"><strong>이 조건에 맞는 변경이 없어요.</strong> <Link href="/dashboard">거르기 풀기</Link></div>
      ) : (
        <ul className="alert-list">
          {summary.recent.map(toAlertView).map((a) => (
            <li key={a.id}>
              <Link className="alert-row" href={`/alerts/${a.id}`}>
                <span className={`badge badge-${a.kindTone}`}>{a.kindLabel}</span>
                <span className="alert-main"><strong>{a.title}</strong><span className="muted">{a.subtitle}</span></span>
                <span className={`badge badge-${a.statusTone}`}>{a.statusLabel}</span>
                <time className="alert-time" dateTime={a.createdAt}>{a.createdAtLabel}</time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Empty() {
  return <div className="notice notice-empty"><strong>아직 보여 줄 데이터가 없어요.</strong> <Link href="/projects">프로젝트를 등록</Link>하면 내 기술과 변경이 여기에 모여요.</div>;
}

function LoadError() {
  return (
    <div className="notice notice-error" role="alert">
      <strong>대시보드를 불러오지 못했어요.</strong> 데이터가 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/dashboard">다시 불러오기</Link>
    </div>
  );
}
