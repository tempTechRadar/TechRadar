import { cookies } from "next/headers";
import Link from "next/link";
import { buildFirstCheckBand, FIRST_CHECK_COOKIE, parseSeenRunIds } from "@/lib/alerts/first-check-band";
import { readRecentFirstReads } from "@/lib/server/first-check-queries";
import { FirstCheckBanner } from "./first-check-banner";
import { FilterSelect, PERIOD_OPTIONS } from "../alerts/filter-select";
import { countRecentChanges } from "@/lib/alerts/count-recent-changes";
import { findReviewDue } from "@/lib/alerts/find-review-due";
import { summarizeDashboard } from "@/lib/alerts/summarize-dashboard";
import { appliedTechs, repoCards } from "@/lib/dashboard/status-view";
import { readDashboardData, type DashboardData } from "@/lib/server/dashboard-queries";
import { readStatusData, type StatusData } from "@/lib/server/status-queries";
import { readNewsFeed, type NewsFeedResult } from "@/lib/server/news-feed";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { listMyAlerts } from "@/lib/server/alert-queries";
import type { AlertRecord } from "@/lib/alerts/to-alert-view";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_DASHBOARD, SAMPLE_STATUS } from "@/lib/dev/preview-data";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { ReviewCard, WeekCard } from "./extra-cards";
import { NewsTab } from "./news-tab";
import { Applied, Pending, Repos, RecommendCard } from "./overview";
import { StatusTabs } from "./status-tabs";

// 현황(P-12f ④, 옛 대시보드 IA-5 · PRD-F22, 주소 /dashboard 유지) = 탭 개요 | 일지(/history) | 소식(?tab=news).
// 개요 = 안내서 필수 숫자 4칸(누르면 같은 조건의 목록) → 내 레포 현황 → 적용한 기술 → 판단 대기 → 이번 주 · 보류 회고 → 추천. 숫자는 모든 프로젝트 합계.
// 로그인 전에는 소식만(공개), 나머지는 로그인 안내. 본인 데이터만(user_id · owner_id 조건 + RLS, 불변 5)
export const metadata = { title: "현황 · TechRadar" };
type Params = { tab?: string; status?: string; period?: string; project?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return <Guest feed={await readNews(null)} />;
  const preview = isPreviewUser(user); // 미리보기(개발용)는 DB를 부르지 않고 샘플로
  if (params.tab === "news") return <Shell now="news"><NewsTab feed={preview ? "preview" : await readNews(user.id)} /></Shell>;
  const supabase = preview ? null : (await getServerSupabase())!;
  const [data, status, band] = !supabase ? [SAMPLE_DASHBOARD, SAMPLE_STATUS, null] : await Promise.all([
    readDashboardData(supabase, user.id).catch((e) => { console.error("현황 조회 실패", e); return null; }),
    readStatusData(supabase, user.id).catch((e) => { console.error("현황: 내 레포 조회 실패", e); return null; }),
    // 띠를 못 읽어도 현황은 그대로 보여 준다(띠는 덧붙이는 요약이라 숫자를 단정하지 않고 숨길 뿐, 로그는 남김)
    readRecentFirstReads(supabase, user.id).then(async (runs) => buildFirstCheckBand(runs, parseSeenRunIds((await cookies()).get(FIRST_CHECK_COOKIE)?.value)))
      .catch((e) => { console.error("첫 점검 띠 조회 실패", e); return null; }),
  ]);
  // 숫자 묶음은 내 기술 · 프로젝트도 읽어 그쪽만 실패할 수 있다: 그때는 알림만 다시 읽어 판단 대기는 살린다(일지와 같은 대비)
  const alerts = data?.alerts ?? (supabase ? await listMyAlerts(supabase, user.id).catch((e) => { console.error("현황 알림 조회 실패", e); return null; }) : null);
  return (
    <Shell now="overview">
      {band ? <FirstCheckBanner band={band} /> : null}
      <Overview data={data} alerts={alerts} status={status} params={params} />
    </Shell>
  );
}

function Shell({ now, children }: { now: "overview" | "news"; children: React.ReactNode }) {
  return <main className="page"><h1>현황</h1><StatusTabs now={now} />{children}</main>;
}

/** 로그인 전: 소식만(공개 값: 바깥 소식 · 뜨는 기술 · 새 공식, 내 취약점은 빠짐). 내 레포 · 알림은 로그인 안내 */
function Guest({ feed }: { feed: NewsFeedResult | null }) {
  return (
    <Shell now="news">
      <p className="notice notice-empty"><strong>로그인하면 내 레포와 알림이 보여요.</strong> <Link href={`/login?next=${encodeURIComponent("/dashboard")}`}>로그인</Link></p>
      <NewsTab feed={feed} />
    </Shell>
  );
}

/** 소식(DataCollector readNewsFeed): 로그인 전은 사용자 없이(공개 값만, RLS), 로그인하면 내 기술 취약점이 더해짐. 연결이 없거나 통째로 실패하면 null(출처별 실패는 feed.failed) */
async function readNews(userId: string | null): Promise<NewsFeedResult | null> {
  const db = await getServerSupabase();
  if (!db) return null;
  return readNewsFeed({ db, serviceDb: getServiceSupabase(), userId }).catch((e) => { console.error("소식 조회 실패", e instanceof Error ? e.message : e); return null; });
}

function Overview({ data, alerts, status, params }: { data: DashboardData | null; alerts: AlertRecord[] | null; status: StatusData | null; params: Params }) {
  const now = new Date();
  const repos = status ? repoCards(status.projects, now) : null;
  return (
    <>
      {data === null ? <LoadError /> : <Numbers data={data} params={params} />}
      <Repos repos={repos} />
      <Applied techs={status ? appliedTechs(status.projects, status.tags) : []} failed={status === null} />
      {alerts ? <>
        <Pending alerts={alerts} />
        <WeekCard count={countRecentChanges(alerts, now)} />
        <ReviewCard items={findReviewDue(alerts, now)} />
      </> : null}
      <RecommendCard />
    </>
  );
}

/** 안내서 필수 숫자 4칸(대시보드와 같은 계산). 거르기는 숫자와 그 목록 링크에만 걸린다 */
function Numbers({ data, params }: { data: DashboardData; params: Params }) {
  const summary = summarizeDashboard({ alerts: data.alerts, techs: data.techs, params, now: new Date() });
  const projectOptions: [string, string][] = [["", "전체"], ...data.projects.map((p): [string, string] => [p.id, p.name])];
  const cards: [string, number, string][] = [
    ["내 기술", summary.techCount, summary.links.techs],
    ["변경", summary.changeCount, summary.links.changes],
    ["판단 대기", summary.pendingCount, summary.links.pending],
    ["완료", summary.doneCount, summary.links.done],
  ];
  return (
    <>
      <form className="filters" aria-label="숫자 거르기">
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
    </>
  );
}

function LoadError() {
  return (
    <div className="notice notice-error" role="alert">
      <strong>숫자와 알림을 불러오지 못했어요.</strong> 데이터가 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/dashboard">다시 불러오기</Link>
    </div>
  );
}
