import Link from "next/link";
import { redirect } from "next/navigation";
import { FilterSelect, KIND_OPTIONS, PERIOD_OPTIONS } from "../alerts/filter-select";
import { filterHistory, parseHistoryFilter } from "@/lib/alerts/filter-history";
import { toAlertView } from "@/lib/alerts/to-alert-view";
import { listMyAlerts } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import "../alerts/alerts.css";

// 기록 찾기(IA-9, PRD-F20): 내가 판단한 알림(적용 후보·보류)과 이유를 찾는다. 본인 기록만(조회가 user_id로 막는다).
type Params = { q?: string; kind?: string; decision?: string; period?: string };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const supabase = (await getServerSupabase())!;
  const records = await listMyAlerts(supabase, user.id).catch((e) => { console.error("기록 조회 실패", e); return null; });
  const judged = records?.filter((r) => r.judgment) ?? [];

  return (
    <main className="alerts">
      <h1>기록 찾기</h1>
      {records === null ? <LoadError /> : judged.length === 0 ? <Empty /> : <Results judged={judged} params={params} />}
    </main>
  );
}

function Results({ judged, params }: { judged: NonNullable<Awaited<ReturnType<typeof listMyAlerts>>>; params: Params }) {
  const items = judged.map((r) => ({ record: r, id: r.id, techName: r.change.techName, kind: r.kind, decision: r.judgment!.decision, judgedAt: r.judgment!.judgedAt }));
  const shown = filterHistory(items, parseHistoryFilter(params, new Date()));
  return (
    <>
      <form className="filters" aria-label="기록 거르기">
        <label className="search">기술 이름
          <input name="q" type="search" defaultValue={params.q ?? ""} placeholder="예: mcp-remote" />
        </label>
        <FilterSelect label="종류" name="kind" value={params.kind} options={KIND_OPTIONS} />
        <FilterSelect label="판단 결과" name="decision" value={params.decision} options={[["", "전체"], ["candidate", "적용 후보"], ["hold", "보류"]]} />
        <FilterSelect label="기간" name="period" value={params.period} options={PERIOD_OPTIONS} />
        <button type="submit" className="btn">찾기</button>
      </form>
      {shown.length === 0 ? (
        <div className="notice notice-empty"><strong>이 조건에 맞는 기록이 없어요.</strong> <Link href="/history">조건 풀기</Link></div>
      ) : (
        <ul className="alert-list">
          {shown.map((item) => {
            const view = toAlertView(item.record);
            return (
              <li key={item.id}>
                <Link className="alert-row" href={`/alerts/${item.id}`}>
                  <span className={`badge badge-${view.kindTone}`}>{view.kindLabel}</span>
                  <span className="alert-main"><strong>{item.techName}</strong><span className="muted">{view.judgmentLine}</span></span>
                  <span className={`badge badge-${view.statusTone}`}>{view.statusLabel}</span>
                  <time className="alert-time" dateTime={item.judgedAt}>{view.judgedAtLabel}</time>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Empty() {
  return <div className="notice notice-empty"><strong>아직 판단한 기록이 없어요.</strong> <Link href="/alerts">알림</Link>에서 적용 후보나 보류를 고르면 여기에 남아요.</div>;
}

function LoadError() {
  return (
    <div className="notice notice-error" role="alert">
      <strong>기록을 불러오지 못했어요.</strong> 기록이 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/history">다시 불러오기</Link>
    </div>
  );
}
