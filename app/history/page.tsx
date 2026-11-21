import Link from "next/link";
import { FilterSelect, KIND_OPTIONS, PERIOD_OPTIONS } from "../alerts/filter-select";
import { filterHistory, parseHistoryFilter } from "@/lib/alerts/filter-history";
import { listTime, toAlertView } from "@/lib/alerts/to-alert-view";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_ALERTS, SAMPLE_MARK_EVENTS } from "@/lib/dev/preview-data";
import { listMyAlerts } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { backTo, LoginNeeded } from "../login/login-needed";
import { getServerSupabase } from "@/lib/supabase/server";
import "../alerts/alerts.css";

// 기록 찾기(IA-9, PRD-F20): 내가 판단한 알림(적용 후보·보류)과 지도에서 남긴 판단(관심 · 적용 후보 · 보류)을 이유와 함께 찾는다.
// 본인 기록만(조회가 user_id로 막고 RLS가 한 번 더).
type Params = { q?: string; kind?: string; decision?: string; period?: string };
type MarkEvent = { id: number; created_at: string; tech_id: string; new_status: "interest" | "candidate" | "hold" | null; reason: string | null; technologies: { display_name: string } | null };
type Records = NonNullable<Awaited<ReturnType<typeof listMyAlerts>>>;

const MARK_LABEL = { interest: "관심", candidate: "적용 후보", hold: "보류" } as const;
const MARK_TONE = { interest: "neutral", candidate: "success", hold: "warning" } as const;
// shortcut: 지도 판단은 최근 200건만 읽는다. 기록이 그보다 많아지면 찾기 조건을 DB 조회로 옮긴다
const MARK_LIMIT = 200;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="기록 찾기" why="로그인하면 내가 남긴 판단(관심 · 적용 후보 · 보류)과 이유를 여기에서 다시 찾을 수 있어요." next={backTo("/history", await searchParams)} />;
  const params = await searchParams;
  // 미리보기(개발용)는 DB를 부르지 않고 샘플로
  const supabase = isPreviewUser(user) ? null : (await getServerSupabase())!;
  const [records, marks] = !supabase ? [SAMPLE_ALERTS, { data: SAMPLE_MARK_EVENTS, error: null }] : await Promise.all([
    listMyAlerts(supabase, user.id).catch((e) => { console.error("기록 조회 실패", e); return null; }),
    supabase.from("tech_mark_events").select("id, created_at, tech_id, new_status, reason, technologies(display_name)").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(MARK_LIMIT),
  ]);
  if (marks.error) console.error("지도 판단 기록 조회 실패", marks.error.message);
  const judged = records?.filter((r) => r.judgment) ?? [];
  const events = (marks.data ?? []) as unknown as MarkEvent[];
  // 하나라도 못 읽었으면 "기록 없음"이 아니라 "읽지 못함"(불변 2)
  const failed = records === null || Boolean(marks.error);

  return (
    <main className="alerts">
      <h1>기록 찾기</h1>
      {!failed && events.length === MARK_LIMIT ? <p className="notice" role="status">지도 판단은 최근 {MARK_LIMIT}건에서만 찾아요. 더 오래된 판단은 여기에서 보이지 않아요(없는 게 아니에요).</p> : null}
      {failed ? <LoadError /> : judged.length + events.length === 0 ? <Empty /> : <Results judged={judged} events={events} params={params} />}
    </main>
  );
}

function Results({ judged, events, params }: { judged: Records; events: MarkEvent[]; params: Params }) {
  const items = [
    ...judged.map((r) => ({ record: r as Records[number] | null, event: null as MarkEvent | null, id: r.id, techName: r.change.techName, kind: r.kind, decision: r.judgment!.decision, judgedAt: r.judgment!.judgedAt, reason: r.judgment!.reason })),
    ...events.map((e) => ({ record: null, event: e, id: `m${e.id}`, techName: e.technologies?.display_name ?? "(이름 없음)", kind: null, decision: e.new_status, judgedAt: e.created_at, reason: e.reason })),
  ].sort((a, b) => Date.parse(b.judgedAt) - Date.parse(a.judgedAt));
  const shown = filterHistory(items, parseHistoryFilter(params, new Date()));
  return (
    <>
      <form className="filters" aria-label="기록 거르기">
        <label className="search">기술 이름 · 이유
          <input name="q" type="search" defaultValue={params.q ?? ""} placeholder="예: mcp-remote, 고친 버전" />
        </label>
        <FilterSelect label="종류" name="kind" value={params.kind} options={KIND_OPTIONS} />
        <FilterSelect label="판단 결과" name="decision" value={params.decision} options={[["", "전체"], ["candidate", "적용 후보"], ["hold", "보류"], ["interest", "관심(지도)"]]} />
        <FilterSelect label="기간" name="period" value={params.period} options={PERIOD_OPTIONS} />
        <button type="submit" className="btn">찾기</button>
      </form>
      {shown.length === 0 ? (
        <div className="notice notice-empty"><strong>이 조건에 맞는 기록이 없어요.</strong> <Link href="/history">조건 풀기</Link></div>
      ) : (
        <ul className="alert-list">
          {shown.map((item) => {
            if (item.event) return <MarkRow key={item.id} event={item.event} />;
            const view = toAlertView(item.record!);
            return (
              <li key={item.id}>
                <Link className="alert-row" href={`/alerts/${item.id}`}>
                  <span className={`badge badge-${view.kindTone}`}>{view.kindLabel}</span>
                  <span className="alert-main"><strong>{item.techName}</strong><span className="muted">{view.judgmentLine}</span>{view.tags.length ? <span className="alert-tags">{view.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span> : null}</span>
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

/** 지도에서 남긴 판단 한 줄: 누르면 지도에서 그 기술 */
function MarkRow({ event }: { event: MarkEvent }) {
  const what = event.new_status ? MARK_LABEL[event.new_status] : "표시 지움";
  return (
    <li>
      <a className="alert-row" href={`/?sel=${encodeURIComponent(`tech:${event.tech_id}`)}`}>
        <span className="badge badge-neutral">지도 판단</span>
        <span className="alert-main"><strong>{event.technologies?.display_name ?? "(이름 없음)"}</strong><span className="muted">{event.reason ? `${what} · 이유: ${event.reason}` : what}</span></span>
        <span className={`badge badge-${event.new_status ? MARK_TONE[event.new_status] : "neutral"}`}>{what}</span>
        <time className="alert-time" dateTime={event.created_at}>{listTime.format(new Date(event.created_at))}</time>
      </a>
    </li>
  );
}

function Empty() {
  return <div className="notice notice-empty"><strong>아직 판단한 기록이 없어요.</strong> <Link href="/alerts">알림</Link>이나 <Link href="/">지도</Link>에서 관심 · 적용 후보 · 보류를 고르면 여기에 남아요.</div>;
}

function LoadError() {
  return (
    <div className="notice notice-error" role="alert">
      <strong>기록을 불러오지 못했어요.</strong> 기록이 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/history">다시 불러오기</Link>
    </div>
  );
}
