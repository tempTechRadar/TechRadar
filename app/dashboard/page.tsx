import { cookies } from "next/headers";
import { Suspense } from "react";
import { buildFirstCheckBand, FIRST_CHECK_COOKIE, parseSeenRunIds } from "@/lib/alerts/first-check-band";
import { readRecentFirstReads } from "@/lib/server/first-check-queries";
import { FirstCheckBanner } from "./first-check-banner";
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
import { NewsTab } from "./news-tab";
import { StatusTabs } from "./status-tabs";
import { SeenMarker } from "./seen-marker";
import { Board, type Widget } from "./board";
import { BoardFilter, InboxBody, LoginFirst, NumbersBody, Reading, ReposBody } from "./widgets";
import { ChangesBody, CheckedBody, HistoryBody, MoveBody, NewsBody, TrendingBody } from "./widgets-more";
import { readMarkMap, readMoveProgress, readRecentMarks, readTrendingForMe, readViewedTechIds, type MarkEventRow, type MoveProgress } from "@/lib/server/board-queries";
import { SAMPLE_MARK_EVENTS } from "@/lib/dev/preview-data";
import type { Trending } from "@/lib/domain/trending";
import { readTrending } from "@/lib/server/trending";
import { parseSeen, SEEN_COOKIE, seenValue } from "@/lib/dashboard/since-last-visit";
import "./board.css";

// 프로젝트 관리(P-12i, 옛 현황 · 대시보드 IA-5 · PRD-F22, 주소 /dashboard 유지) = 위젯 캔버스 보드(Monday식, 배치는 이 브라우저에만).
// D1 위젯: W1 숫자 4칸(안내서 필수, 누르면 같은 조건의 목록) · W2 판단함 · W3 레포 보드. 위젯마다 따로 읽고(Suspense) 읽는 중 · 없음 · 읽지 못함을 나눠 보인다(불변 2).
// 보드 전체 거르기(기간 · 상태 · 프로젝트)가 모든 위젯에 걸린다. 로그인 전에는 소식만 실제 값, 나머지는 로그인 안내. 본인 데이터만(user_id · owner_id 조건 + RLS, 불변 5)
export const metadata = { title: "프로젝트 관리 · TechRadar" };
type Params = { tab?: string; status?: string; period?: string; project?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return <Guest feed={await readNews(null)} trend={guestTrend()} />;
  const preview = isPreviewUser(user); // 미리보기(개발용)는 DB를 부르지 않고 샘플로
  if (params.tab === "news") return <Shell now="news"><NewsTab feed={preview ? "preview" : await readNews(user.id)} /></Shell>;
  const supabase = preview ? null : (await getServerSupabase())!;
  // B5 "새로 옴": 지난번 기준을 읽고, 이번 기준 시각은 알림을 읽기 시작하기 직전에 잡는다(그 사이에 온 알림이 "본 것"이 되지 않게)
  const visitAt = new Date();
  const seen = parseSeen((await cookies()).get(SEEN_COOKIE)?.value, user.id, visitAt);
  // 위젯마다 기다릴 약속을 한 번만 만든다(같은 표를 두 번 읽지 않게). 못 읽으면 null
  const data: Promise<DashboardData | null> = !supabase ? Promise.resolve(SAMPLE_DASHBOARD) : readDashboardData(supabase, user.id).catch((e) => { console.error("보드: 숫자 조회 실패", e); return null; });
  const status: Promise<StatusData | null> = !supabase ? Promise.resolve(SAMPLE_STATUS) : readStatusData(supabase, user.id).catch((e) => { console.error("보드: 내 레포 조회 실패", e); return null; });
  // 숫자 묶음은 내 기술 · 프로젝트도 읽어 그쪽만 실패할 수 있다: 그때는 알림만 다시 읽어 판단함은 살린다
  const alerts: Promise<AlertRecord[] | null> = data.then((d) => d?.alerts ?? (supabase ? listMyAlerts(supabase, user.id).catch((e) => { console.error("보드: 알림 조회 실패", e); return null; }) : null));
  // D2 위젯 읽기(미리보기는 샘플). 못 읽으면 null → 위젯이 "읽지 못함"
  const fail = <T,>(what: string) => (e: unknown): T | null => { console.error(`보드: ${what} 조회 실패`, e instanceof Error ? e.message : e); return null; };
  const move: Promise<MoveProgress | null> = !supabase ? Promise.resolve({ candidates: 3, blueprints: [], exports: 1 }) : readMoveProgress(supabase, user.id).catch(fail("옮기기 진행"));
  const viewed: Promise<Set<string> | null> = !supabase ? status.then((s) => new Set((s?.projects ?? []).flatMap((p) => p.my_technologies.slice(0, 2).flatMap((t) => (t.tech_id ? [t.tech_id] : []))))) : readViewedTechIds(supabase, user.id).catch(fail("등급 본 기록"));
  const marks: Promise<Map<string, string> | null> = !supabase ? Promise.resolve(new Map(SAMPLE_MARK_EVENTS.map((e) => [e.tech_id, e.new_status]))) : readMarkMap(supabase, user.id).catch(fail("판단 표시"));
  const recentMarks: Promise<MarkEventRow[] | null> = !supabase ? Promise.resolve(SAMPLE_MARK_EVENTS.map((e) => ({ id: String(e.id), createdAt: e.created_at, status: e.new_status, name: e.technologies.display_name })))
    : readRecentMarks(supabase, user.id).catch(fail("판단 기록"));
  const service = getServiceSupabase();
  const trend: Promise<{ items: Trending[]; same: boolean } | null> = !supabase ? Promise.resolve({ items: [], same: false })
    : !service ? Promise.resolve(null) : status.then((s) => readTrendingForMe(service, supabase, (s?.projects ?? []).flatMap((p) => p.my_technologies.flatMap((t) => (t.tech_id ? [t.tech_id] : []))))).catch(fail("요즘 뜨는 대안"));
  const news: Promise<NewsFeedResult | null | "preview"> = preview ? Promise.resolve("preview") : readNews(user.id);
  const band = supabase ? await readRecentFirstReads(supabase, user.id).then(async (runs) => buildFirstCheckBand(runs, parseSeenRunIds((await cookies()).get(FIRST_CHECK_COOKIE)?.value)))
    .catch((e) => { console.error("첫 점검 띠 조회 실패", e); return null; }) : null; // 띠는 덧붙이는 요약이라 못 읽으면 숨김
  const widgets: Widget[] = [
    { id: "numbers", title: "숫자", body: <Suspense fallback={<Reading what="숫자" />}><NumbersBody data={data} params={params} /></Suspense> },
    { id: "inbox", title: "판단함", body: <Suspense fallback={<Reading what="판단 대기" />}><InboxBody alerts={alerts} params={params} seen={seen} /></Suspense> },
    { id: "repos", title: "레포 보드", body: <Suspense fallback={<Reading what="내 레포" />}><ReposBody status={status} alerts={alerts} params={params} marks={marks} move={move} /></Suspense> },
    { id: "changes", title: "바뀐 것", body: <Suspense fallback={<Reading what="바뀐 것" />}><ChangesBody alerts={alerts} params={params} /></Suspense> },
    { id: "move", title: "옮기기 진행", body: <Suspense fallback={<Reading what="옮기기 진행" />}><MoveBody move={move} status={status} params={params} /></Suspense> },
    { id: "checked", title: "점검한 비율", body: <Suspense fallback={<Reading what="점검한 비율" />}><CheckedBody status={status} viewed={viewed} params={params} /></Suspense> },
    { id: "news", title: "소식", body: <Suspense fallback={<Reading what="소식" />}><NewsBody feed={news} /></Suspense> },
    { id: "trending", title: "요즘 뜨는 대안", body: <Suspense fallback={<Reading what="요즘 뜨는 대안" />}><TrendingBody trend={trend} /></Suspense> },
    { id: "history", title: "기록 찾기", body: <Suspense fallback={<Reading what="기록" />}><HistoryBody alerts={alerts} marks={recentMarks} /></Suspense> },
  ];
  return (
    <Shell now="overview">
      {band ? <FirstCheckBanner band={band} /> : null}
      <Suspense fallback={<p className="muted">거르기를 준비하는 중…</p>}><BoardFilter data={data} params={params} /></Suspense>
      <Board widgets={widgets} storeKey={`project-board-v1:${user.id.slice(0, 8)}`} />
      {/* 알림을 읽었을 때만 기준을 앞당긴다(못 읽으면 못 본 알림이 "새로 옴"을 잃지 않게, 불변 2 · 4). 미리보기는 쓰지 않음 */}
      {preview ? null : <Suspense fallback={null}><Seen alerts={alerts} value={seenValue(user.id, visitAt)} /></Suspense>}
    </Shell>
  );
}

async function Seen({ alerts, value }: { alerts: Promise<AlertRecord[] | null>; value: string }) {
  return (await alerts) ? <SeenMarker value={value} /> : null;
}

function Shell({ now, children }: { now: "overview" | "news"; children: React.ReactNode }) {
  return <main className="page board-page"><h1>프로젝트 관리</h1><StatusTabs now={now} />{children}</main>;
}

/** 로그인 전: 내 데이터 위젯 자리는 로그인 안내, 소식만 실제 값(공개 값: 바깥 소식 · 뜨는 기술 · 새 공식, 내 취약점은 빠짐) */
function Guest({ feed, trend }: { feed: NewsFeedResult | null; trend: Promise<{ items: Trending[]; same: null } | null> }) {
  const widgets: Widget[] = [
    { id: "numbers", title: "숫자", body: <LoginFirst /> },
    { id: "inbox", title: "판단함", body: <LoginFirst /> },
    { id: "repos", title: "레포 보드", body: <LoginFirst /> },
    { id: "changes", title: "바뀐 것", body: <LoginFirst /> },
    { id: "move", title: "옮기기 진행", body: <LoginFirst /> },
    { id: "checked", title: "점검한 비율", body: <LoginFirst /> },
    { id: "news", title: "소식", body: <NewsTab feed={feed} /> },
    { id: "trending", title: "요즘 뜨는 대안", body: <Suspense fallback={<Reading what="요즘 뜨는 대안" />}><TrendingBody trend={trend} /></Suspense> },
    { id: "history", title: "기록 찾기", body: <LoginFirst /> },
  ];
  return <Shell now="overview"><Board widgets={widgets} storeKey="project-board-v1:guest" /></Shell>;
}

/** 로그인 전 "요즘 뜨는 대안": 공개 목록에서 뜨는 것(서비스 연결, 공개 목록 규칙은 readTrending). 못 읽으면 null */
function guestTrend(): Promise<{ items: Trending[]; same: null } | null> {
  const service = getServiceSupabase();
  return service ? readTrending(service, Date.now(), 6).then((items) => ({ items, same: null }), (e) => { console.error("보드: 손님 뜨는 기술 조회 실패", e instanceof Error ? e.message : e); return null; }) : Promise.resolve(null);
}

/** 소식(DataCollector readNewsFeed): 로그인 전은 사용자 없이(공개 값만, RLS), 로그인하면 내 기술 취약점이 더해짐. 연결이 없거나 통째로 실패하면 null(출처별 실패는 feed.failed) */
async function readNews(userId: string | null): Promise<NewsFeedResult | null> {
  const db = await getServerSupabase();
  if (!db) return null;
  return readNewsFeed({ db, serviceDb: getServiceSupabase(), userId }).catch((e) => { console.error("소식 조회 실패", e instanceof Error ? e.message : e); return null; });
}
