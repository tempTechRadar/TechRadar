import { cookies } from "next/headers";
import { Suspense } from "react";
import { buildFirstCheckBand, FIRST_CHECK_COOKIE, parseSeenRunIds } from "@/lib/alerts/first-check-band";
import { readRecentFirstReads } from "@/lib/server/first-check-queries";
import { FirstCheckBanner } from "./first-check-banner";
import { readStatusData, type StatusData } from "@/lib/server/status-queries";
import { readNewsFeed, type NewsFeedResult } from "@/lib/server/news-feed";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { listMyAlerts } from "@/lib/server/alert-queries";
import type { AlertRecord } from "@/lib/alerts/to-alert-view";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_DASHBOARD, SAMPLE_STATUS } from "@/lib/dev/preview-data";
import { getCurrentUser } from "@/lib/server/current-user";
import { searchTerm } from "@/lib/domain/my-tech-view";
import { searchCatalog, type CatalogHit } from "@/lib/server/my-tech";
import { getServerSupabase } from "@/lib/supabase/server";
import { ManageNotices, RepoManageBody, type ManageQuery } from "./repo-manage";
import "./status.css"; // 공용 모양(옛 현황 탭 줄은 없앰, P-12i D3)
import { Board, type Widget } from "./board";
import { Band, LoginFirst, Reading, ReposBody } from "./widgets";
import { AddBody, BlueprintBody, RadarBody } from "./widgets-more";
import { countNewTechs, readMarkMap, readMoveProgress, readTrendingForMe, type MoveProgress } from "@/lib/server/board-queries";
import { SAMPLE_MARK_EVENTS } from "@/lib/dev/preview-data";
import type { Trending } from "@/lib/domain/trending";
import { readTrending } from "@/lib/server/trending";
import "./board.css";

// 프로젝트 관리(P-12i · P-12k K1, 옛 현황 · 대시보드 IA-5 · PRD-F22, 주소 /dashboard 유지) = 컴팩트 타공보드: 고정 숫자 띠 + 걸린 판 4개(배치는 이 브라우저에만).
// 띠 = 안내서 필수 대시보드(기간 하나로 거르기 · 판단 대기 / 완료로 상태 · 숫자 = 목록 · 없음 ≠ 읽지 못함). 판: ① 진행 중 프로젝트 ② 지도 · 소식 ③ 청사진 ④ 직접 추가 (+ 레포 관리 큰 표는 "+ 판"에서만, K2까지).
// 판마다 따로 읽고(Suspense) 읽는 중 · 없음 · 읽지 못함을 나눠 보인다(불변 2). 로그인 전에는 공개 값(새 기술 수 · 뜨는 것 · 소식)만. 본인 데이터만(user_id · owner_id 조건 + RLS, 불변 5)
export const metadata = { title: "프로젝트 관리 · TechRadar" };
type Params = { period?: string } & ManageQuery;

// 등록 · 다시 읽기(서버 액션)가 이 화면의 진행 중 프로젝트 판에서 돈다: 저장소 파일 · 코드 파일 · OSV(1초 간격)를 다 읽을 시간(옛 /projects와 같음). Hobby 최대
export const maxDuration = 300;
const STORE = "project-board-v2"; // K1에서 판이 바뀌어 옛 배치(v1)는 읽지 않는다

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const period = typeof params.period === "string" ? params.period : "";
  if (!user) return <Guest period={period} />;
  const preview = isPreviewUser(user); // 미리보기(개발용)는 DB를 부르지 않고 샘플로
  const supabase = preview ? null : (await getServerSupabase())!;
  // 판마다 기다릴 약속을 한 번만 만든다(같은 표를 두 번 읽지 않게). 못 읽으면 null → 판이 "읽지 못함"
  const fail = <T,>(what: string) => (e: unknown): T | null => { console.error(`보드: ${what} 조회 실패`, e instanceof Error ? e.message : e); return null; };
  const alerts: Promise<AlertRecord[] | null> = !supabase ? Promise.resolve(SAMPLE_DASHBOARD.alerts) : listMyAlerts(supabase, user.id).catch(fail("알림"));
  const status: Promise<StatusData | null> = !supabase ? Promise.resolve(SAMPLE_STATUS) : readStatusData(supabase, user.id).catch(fail("내 레포"));
  const move: Promise<MoveProgress | null> = !supabase ? Promise.resolve({ candidates: 3, blueprints: [], exports: 1 }) : readMoveProgress(supabase, user.id).catch(fail("청사진"));
  const marks: Promise<Map<string, string> | null> = !supabase ? Promise.resolve(new Map(SAMPLE_MARK_EVENTS.map((e) => [e.tech_id, e.new_status]))) : readMarkMap(supabase, user.id).catch(fail("판단 표시"));
  const service = getServiceSupabase();
  const newToday = preview ? Promise.resolve(3) : newTechsToday();
  const trend: Promise<{ items: Trending[] } | null> = !supabase ? Promise.resolve({ items: [] })
    : !service ? Promise.resolve(null) : status.then((s) => readTrendingForMe(service, supabase, (s?.projects ?? []).flatMap((p) => p.my_technologies.flatMap((t) => (t.tech_id ? [t.tech_id] : []))))).catch(fail("요즘 뜨는 것"));
  const news: Promise<NewsFeedResult | null | "preview"> = preview ? Promise.resolve("preview") : readNews(user.id);
  const q = params.q ?? "";
  const hits: Promise<CatalogHit[] | null | "failed"> = !supabase || !searchTerm(q) ? Promise.resolve(null) : searchCatalog(supabase, q).catch((e) => { console.error("기술 검색 실패", e); return "failed" as const; });
  const band = supabase ? await readRecentFirstReads(supabase, user.id).then(async (runs) => buildFirstCheckBand(runs, parseSeenRunIds((await cookies()).get(FIRST_CHECK_COOKIE)?.value)))
    .catch((e) => { console.error("첫 점검 띠 조회 실패", e); return null; }) : null; // 띠는 덧붙이는 요약이라 못 읽으면 숨김
  const widgets: Widget[] = [
    { id: "repos", title: "진행 중 프로젝트", body: <Suspense fallback={<Reading what="내 레포" />}><ReposBody status={status} alerts={alerts} marks={marks} move={move} /></Suspense> },
    { id: "radar", title: "지도 · 소식", body: <Suspense fallback={<Reading what="지도 · 소식" />}><RadarBody newToday={newToday} alerts={alerts} trend={trend} feed={news} /></Suspense> },
    { id: "blueprint", title: "청사진", body: <Suspense fallback={<Reading what="청사진" />}><BlueprintBody move={move} status={status} who={user.id} /></Suspense> },
    { id: "add", title: "직접 추가", body: preview ? <p className="board-empty">미리보기(개발용)에서는 넣지 않아요.</p>
      : <Suspense fallback={<Reading what="넣을 레포 목록" />}><AddBody status={status} q={q} hits={hits} /></Suspense> },
    // 옛 "내 프로젝트" 목록(P-12i D3): 내 기술 표 · 숨기기 · 이름 고치기 · 보관 · 되살리기. 기본 배치에선 빠짐(K2 레포 상세로 옮김). 미리보기는 DB를 안 불러 안내만
    { id: "manage", title: "레포 관리 · 내 기술", body: preview ? <p className="board-empty">미리보기(개발용)에서는 레포 관리를 쓰지 않아요.</p>
      : <Suspense fallback={<Reading what="내 기술 목록" />}><RepoManageBody user={user} query={params} /></Suspense> },
  ];
  return (
    <Shell>
      <ManageNotices query={params} />
      {band ? <FirstCheckBanner band={band} /> : null}
      <Suspense fallback={<Reading what="숫자" />}><Band alerts={alerts} status={status} newToday={newToday} period={period} /></Suspense>
      {/* "새로 옴" 기준(SeenMarker)은 앞당기지 않는다: K1부터 판단 대기 목록을 안 보여 주니, 앞당기면 못 본 알림이 기록 찾기에서 "새로 옴"을 잃는다(불변 4 취지) */}
      <Board widgets={widgets} storeKey={`${STORE}:${user.id.slice(0, 8)}`} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="page board-page"><h1>프로젝트 관리</h1>{children}</main>;
}

/** 로그인 전: 내 데이터 판 자리는 로그인 안내, 공개 값(오늘의 새 기술 수 · 뜨는 것 · 소식)만 실제 값(내 취약점은 빠짐) */
async function Guest({ period }: { period: string }) {
  const newToday = newTechsToday(), feed = await readNews(null);
  const widgets: Widget[] = [
    { id: "repos", title: "진행 중 프로젝트", body: <LoginFirst /> },
    { id: "radar", title: "지도 · 소식", body: <Suspense fallback={<Reading what="지도 · 소식" />}><RadarBody newToday={newToday} alerts={null} trend={guestTrend()} feed={feed} /></Suspense> },
    { id: "blueprint", title: "청사진", body: <BlueprintBody move={null} status={null} who="guest" /> },
    { id: "add", title: "직접 추가", body: <LoginFirst /> },
    { id: "manage", title: "레포 관리 · 내 기술", body: <LoginFirst /> },
  ];
  return (
    <Shell>
      <Suspense fallback={<Reading what="숫자" />}><Band alerts={null} status={null} newToday={newToday} period={period} /></Suspense>
      <Board widgets={widgets} storeKey={`${STORE}:guest`} />
    </Shell>
  );
}

/** 오늘(24시간 안)의 새 기술 수: 지도 NEW와 같은 규칙, 서비스 연결(공개 값). 못 읽으면 null */
function newTechsToday(): Promise<number | null> {
  const service = getServiceSupabase();
  if (!service) return Promise.resolve(null);
  return countNewTechs(service, new Date(Date.now() - 86_400_000).toISOString()).catch((e) => { console.error("보드: 새 기술 수 조회 실패", e instanceof Error ? e.message : e); return null; });
}

/** 로그인 전 "요즘 뜨는 것": 공개 목록에서 뜨는 것(서비스 연결, 공개 목록 규칙은 readTrending). 못 읽으면 null */
function guestTrend(): Promise<{ items: Trending[] } | null> {
  const service = getServiceSupabase();
  return service ? readTrending(service, Date.now(), 6).then((items) => ({ items }), (e) => { console.error("보드: 손님 뜨는 기술 조회 실패", e instanceof Error ? e.message : e); return null; }) : Promise.resolve(null);
}

/** 소식(DataCollector readNewsFeed): 로그인 전은 사용자 없이(공개 값만, RLS), 로그인하면 내 기술 취약점이 더해짐. 연결이 없거나 통째로 실패하면 null(출처별 실패는 feed.failed) */
async function readNews(userId: string | null): Promise<NewsFeedResult | null> {
  const db = await getServerSupabase();
  if (!db) return null;
  return readNewsFeed({ db, serviceDb: getServiceSupabase(), userId }).catch((e) => { console.error("소식 조회 실패", e instanceof Error ? e.message : e); return null; });
}
