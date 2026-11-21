// 첫 화면 = 기술 지도(IA-10, D8). 로그인 뒤: 위에 첫 점검 띠, 아래에 지도. 판단 대기 · 최근 변경 수는 일지 맨 위로 옮겼다(11-21 사용자 결정 B).
// 로그인 전: 누구에게나 같은 카탈로그 지도와 로그인 유도 띠(ADR 0029). 내 기술·숫자·첫 점검 띠는 없다.
import { cookies } from "next/headers";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { buildFirstCheckBand, FIRST_CHECK_COOKIE, parseSeenRunIds } from "@/lib/alerts/first-check-band";
import { buildTechMap, capNew, type TechMapModel } from "@/lib/map/build-map";
import { getCurrentUser } from "@/lib/server/current-user";
import { readDashboardData } from "@/lib/server/dashboard-queries";
import { readRecentFirstReads } from "@/lib/server/first-check-queries";
import { readMyTechTagMap } from "@/lib/server/my-tech-tags";
import { CATALOG_LIMIT, NEW_RULE_VERSION, PICK_RULE, readGuestMapInput, readListedByIds, readMapInput, TECH_COLUMNS } from "@/lib/server/map-queries";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { readTrending } from "@/lib/server/trending";
import { MIN_HN_POINTS, MIN_STAR_GAIN, TREND_DAYS } from "@/lib/domain/trending";
import { getServerSupabase } from "@/lib/supabase/server";
import { FirstCheckBanner } from "./dashboard/first-check-banner";
import GoogleLoginButton from "./login/google-login-button";
import type { ReactNode } from "react";
import { CanvasMap } from "./tech-map/canvas-map";
import { StartChecklist } from "./tech-map/start-checklist";
import { startSteps } from "@/lib/onboarding/start-steps";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_DASHBOARD, SAMPLE_FIRST_READS, sampleMapInput } from "@/lib/dev/preview-data";
import "./alerts/alerts.css";

/** 주소의 sel=tech:<uuid>(지도에서 보기)에서 기술 id만. 모양이 다르면 버린다 */
const selTech = (query: string) => { const m = /^tech:([0-9a-f-]{36})$/i.exec(new URLSearchParams(query).get("sel") ?? ""); return m ? [m[1]] : []; };
/** 지도 위 NEW 표시 수(11-21 사용자 결정, ADR 0030). 새 기술 화면은 전부 */
const MAP_NEW = 15;
const logged = (what: string) => (e: unknown) => { console.error(what, e instanceof Error ? e.message : e); return null; };

// 로그인 전 지도는 누구에게나 같아 10분 동안 한 번만 읽는다(요청이 몰려도 DB는 그대로, ADR 0029). 실패는 기억하지 않는다(던지면 캐시 안 됨).
// 키에 공개 칸을 넣어 칸이 바뀐 배포는 옛 캐시를 쓰지 않는다. shortcut: 관리자가 상태·갈래를 고쳐도 최대 10분 늦게 보인다, 바로 보여야 하면 태그로 비운다
const readGuestMap = unstable_cache(async () => {
  const db = getServiceSupabase();
  if (!db) throw new Error("서비스 키 설정이 없음");
  return readGuestMapInput(db);
}, ["guest-map", TECH_COLUMNS, NEW_RULE_VERSION, String(CATALOG_LIMIT), PICK_RULE], { revalidate: 600 }); // 올리는 수가 바뀐 배포는 옛 캐시를 안 씀

// 요즘 뜨는 기술 id(P-12f, DataCollector readTrending): 누구에게나 같은 공개 값이라 10분에 한 번만 읽는다(DB 3번). 실패는 기억하지 않는다(던지면 캐시 안 됨)
const readHot = unstable_cache(async () => {
  const db = getServiceSupabase();
  if (!db) throw new Error("서비스 키 설정이 없음");
  return (await readTrending(db, Date.now(), 30)).map((t) => t.id);
}, ["trending-ids", String(TREND_DAYS), String(MIN_STAR_GAIN), String(MIN_HN_POINTS), "30"], { revalidate: 600 });
/** null = 읽지 못함(칩이 "불러오지 못했어요") */
const hotIds = () => readHot().catch(logged("요즘 뜨는 기술 조회 실패"));

// canSave = 로그인함(보기 기억·판단 남기기)
function MapBody({ model, projects, query, canSave, who, top }: { model: TechMapModel | null; projects: { id: string; name: string }[]; query: string; canSave: boolean; who?: string; top: ReactNode }) {
  if (model === null) return <>{top ? <div className="map-top map-top-flat">{top}</div> : null}<div className="notice" role="alert"><strong>지도를 읽지 못했어요.</strong> 기술이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.{canSave ? <> <Link href="/projects">내 기술 목록</Link>은 따로 볼 수 있어요.</> : null}</div></>;
  if (model.nodes.length === 0) return <>{top ? <div className="map-top map-top-flat">{top}</div> : null}<div className="notice notice-empty"><strong>아직 지도에 올릴 기술이 없어요.</strong>{canSave ? <> <Link href="/projects">내 프로젝트를 등록</Link>하면 저장소에서 읽은 기술이 지도에 와요.</> : " 모은 기술이 들어오면 여기에 보여요."}</div></>;
  return <CanvasMap model={model} projects={projects} initialQuery={query} canSave={canSave} login={canSave} who={who} top={top} />;
}

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // 보기 설정(묶기·색·거르기)은 주소에 실려 온다. 글자 값만 넘기고 해석은 parseView가 아는 값만 받는다
  const query = new URLSearchParams(Object.entries(await searchParams).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  const user = await getCurrentUser();
  if (!user) {
    const [cached, hot] = await Promise.all([readGuestMap().catch(logged("로그인 전 지도 조회 실패")), hotIds()]);
    // 새 기술의 "지도에서 보기"(sel=)로 온 기술이 캐시한 1,200개 밖이면 그 하나만 더 읽어 올린다(공개 목록 기술만)
    const want = selTech(query).filter((id) => cached && !cached.techs.some((t) => t.id === id));
    const db = want.length ? getServiceSupabase() : null;
    const extra = db ? await readListedByIds(db, want).catch(logged("고른 기술 조회 실패")) : null;
    const input = cached && extra?.length ? { ...cached, techs: [...cached.techs, ...extra] } : cached;
    return (
      <main className="alerts map-page">
        <h1 className="sr-only">기술 지도</h1>
        <MapBody model={input ? capNew(buildTechMap({ ...input, trending: hot }, new Date()), MAP_NEW) : null} projects={[]} query={query} canSave={false} top={<>
          <span className="map-chip map-chip-note">로그인하면 관심·판단·내 기술 비교가 열려요.</span>
          <GoogleLoginButton next={query ? `/?${query}` : "/"} />{/* 로그인 전 보기는 주소에만 있으니 들고 간다 */}
        </>} />
      </main>
    );
  }

  const seen = parseSeenRunIds((await cookies()).get(FIRST_CHECK_COOKIE)?.value);
  // 지도와 숫자는 따로 읽는다: 하나를 못 읽어도 다른 하나는 보여 주고, 못 읽은 쪽은 "없음"이 아니라 "읽지 못함"으로(불변 2)
  // 미리보기(개발용)는 DB를 부르지 않고 샘플로. 로그인한 사람이 있으면 연결 설정도 있다(getCurrentUser가 같은 설정으로 읽음)
  const db = isPreviewUser(user) ? null : (await getServerSupabase())!;
  const [input, dash, firstReads, tags, hot] = db ? await Promise.all([
    readMapInput(db, user.id, user.isDemo, selTech(query)).catch(logged("지도 조회 실패")),
    readDashboardData(db, user.id).catch(logged("지도 프로젝트 · 시작하기 조회 실패")),
    readRecentFirstReads(db, user.id).catch(logged("첫 점검 띠 조회 실패")),
    readMyTechTagMap(db, user.id).catch(logged("내 태그 조회 실패")), // 못 읽어도 지도는 그리고 태그만 "읽지 못함"
    hotIds(),
  ]) : [sampleMapInput(), SAMPLE_DASHBOARD, SAMPLE_FIRST_READS, new Map<string, string[]>(), []];
  const band = firstReads ? buildFirstCheckBand(firstReads, seen) : null;
  const model = input ? capNew(buildTechMap({ ...input, tags: tags ? Object.fromEntries(tags) : null, trending: hot }, new Date()), MAP_NEW) : null;
  const start = startSteps(dash && input && firstReads ? { projects: dash.projects.length, unseenCheck: band !== null, judged: dash.alerts.some((a) => a.judgment) || (input.marks?.length ?? 0) > 0 } : null);

  return (
    <main className="alerts map-page">
      <h1 className="sr-only">기술 지도</h1>
      {band ? <FirstCheckBanner band={band} /> : null}
      <MapBody model={model} projects={dash?.projects ?? []} query={query} canSave who={user.id} top={<>
        {dash ? null : <span className="notice" role="status">내 프로젝트 목록을 읽지 못했어요(없다는 뜻이 아니에요). 프로젝트로 거르기 · 시작하기가 빠져 있어요.</span>}
        {start ? <StartChecklist steps={start} who={user.id} /> : null}
        {model?.mode === "catalog" ? <Link className="btn btn-primary" href="/projects">내 프로젝트를 등록하면 내 기술과 비교군이 지도에 와요</Link> : null}
      </>} />
    </main>
  );
}
