import Link from "next/link";
import { FilterSelect, KIND_OPTIONS, PERIOD_OPTIONS } from "../alerts/filter-select";
import { filterHistory, parseHistoryFilter } from "@/lib/alerts/filter-history";
import { listTime, toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_ALERTS, SAMPLE_MARK_EVENTS } from "@/lib/dev/preview-data";
import { listMyAlerts } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { backTo, LoginNeeded } from "../login/login-needed";
import { getServerSupabase } from "@/lib/supabase/server";
import { StatusTabs } from "../dashboard/status-tabs";
import { SeenMarker } from "../dashboard/seen-marker";
import { countNew, isNew, parseSeen, SEEN_COOKIE, seenValue } from "@/lib/dashboard/since-last-visit";
import { cookies } from "next/headers";
import "../dashboard/status.css";

// 일지(IA-9, PRD-F20 · 11-21 화면 개편 B → P-12f ④ 현황의 탭): 판단 대기 알림 → 알림 · 판단을 시간순 한 흐름 + 찾기. 숫자 4칸은 현황 개요에만.
// 흐름의 "알림"은 내 기술의 변경이 알림으로 온 것(대시보드 "최근 변경"과 같은 기준), "판단"은 알림 판단과 지도에서 남긴 판단(관심 · 적용 후보 · 보류).
// 본인 기록만(조회가 user_id로 막고 RLS가 한 번 더).
type Params = { q?: string; kind?: string; decision?: string; period?: string };
type MarkEvent = { id: number; created_at: string; tech_id: string; new_status: "interest" | "candidate" | "hold" | null; reason: string | null; technologies: { display_name: string } | null };
/** 흐름 한 줄: 알림이 옴(alert) · 알림 판단(judged) · 지도 판단(mark). 알림이 온 줄은 판단이 없어 decision이 null */
type Entry = { id: string; at: "alert" | "judged" | "mark"; record: AlertRecord | null; event: MarkEvent | null; techName: string; kind: AlertRecord["kind"] | null; decision: "candidate" | "hold" | "interest" | null; judgedAt: string; reason: string | null };

const MARK_LABEL = { interest: "관심", candidate: "적용 후보", hold: "보류" } as const;
const MARK_TONE = { interest: "neutral", candidate: "success", hold: "warning" } as const;
// shortcut: 지도 판단은 최근 200건만 읽는다. 기록이 그보다 많아지면 찾기 조건을 DB 조회로 옮긴다
const MARK_LIMIT = 200;

export const metadata = { title: "일지 · 프로젝트 관리 · TechRadar" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="일지" why="로그인하면 판단을 기다리는 알림, 지금까지 온 알림과 내 판단(관심 · 적용 후보 · 보류)을 이유와 함께 여기에서 다시 찾을 수 있어요." next={backTo("/history", await searchParams)} />;
  const params = await searchParams;
  // 미리보기(개발용)는 DB를 부르지 않고 샘플로
  const supabase = isPreviewUser(user) ? null : (await getServerSupabase())!;
  // B5 "새로 옴": 지난 기준을 읽고, 이번 기준 시각은 알림을 읽기 직전에 잡는다(현황 개요와 같은 쿠키)
  const visitAt = new Date();
  const seen = parseSeen((await cookies()).get(SEEN_COOKIE)?.value, user.id, visitAt);
  const [records, marks] = !supabase ? [SAMPLE_ALERTS, { data: SAMPLE_MARK_EVENTS, error: null }] : await Promise.all([
    listMyAlerts(supabase, user.id).catch((e) => { console.error("일지 알림 조회 실패", e instanceof Error ? e.message : e); return null; }),
    supabase.from("tech_mark_events").select("id, created_at, tech_id, new_status, reason, technologies(display_name)").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(MARK_LIMIT),
  ]);
  if (marks.error) console.error("지도 판단 기록 조회 실패", marks.error.message);
  const events = (marks.data ?? []) as unknown as MarkEvent[];

  return (
    <main className="page">
      <h1>프로젝트 관리</h1>
      <StatusTabs now="journal" />
      {records && supabase ? <SeenMarker value={seenValue(user.id, visitAt)} /> : null}{/* 알림을 읽었을 때만, 미리보기는 안 씀 */}
      <Pending records={records} seen={seen} />
      <h2>흐름</h2>
      {records && !marks.error && events.length === MARK_LIMIT ? <p className="notice" role="status">지도 판단은 최근 {MARK_LIMIT}건에서만 찾아요. 더 오래된 판단은 여기에서 보이지 않아요(없는 게 아니에요).</p> : null}
      {/* 하나라도 못 읽었으면 "기록 없음"이 아니라 "읽지 못함"(불변 2) */}
      {records === null || marks.error ? <LoadError /> : records.length + events.length === 0 ? <Empty /> : <Results records={records} events={events} params={params} />}
    </main>
  );
}

/** 판단을 기다리는 알림(최근 것 먼저): 누르면 알림 상세에서 판단 */
function Pending({ records, seen }: { records: AlertRecord[] | null; seen: number | null }) {
  const pending = (records ?? []).filter((r) => r.status === "pending").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const fresh = countNew(records ?? [], seen);
  return (
    <section aria-labelledby="pending-title">
      <h2 id="pending-title">판단 대기 {records ? <span className="muted">{pending.length}{fresh ? ` · 새로 옴 ${fresh}` : ""}</span> : null}</h2>
      {records === null ? <p className="notice notice-error" role="alert"><strong>판단 대기 알림을 불러오지 못했어요.</strong> 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>
        : pending.length === 0 ? <p className="muted">판단을 기다리는 알림이 없어요.</p>
        : <ul className="alert-list">{pending.map((r) => <AlertRow key={r.id} record={r} fresh={isNew(r.createdAt, seen)} />)}</ul>}
    </section>
  );
}

/** 알림 한 줄(알림 목록과 같은 모양). note는 흐름에서 "알림이 옴"처럼 앞에 붙는 말, fresh는 판단 대기에서만 넘기는 "새로 옴"(B5) */
function AlertRow({ record, note, fresh = false }: { record: AlertRecord; note?: string; fresh?: boolean }) {
  const view = toAlertView(record);
  return (
    <li>
      <Link className="alert-row" href={`/alerts/${record.id}`} data-new={fresh ? "" : undefined}>
        <span className={`badge badge-${view.kindTone}`}>{view.kindLabel}</span>
        <span className="alert-main"><strong>{fresh ? <span className="tag status-new">새로 옴</span> : null}{view.title}</strong><span className="muted">{note ? `${note} · ${view.subtitle}` : view.subtitle}</span>{view.tags.length ? <span className="alert-tags">{view.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span> : null}</span>
        <span className={`badge badge-${view.statusTone}`}>{view.statusLabel}</span>
        <time className="alert-time" dateTime={record.createdAt}>{view.createdAtLabel}</time>
      </Link>
    </li>
  );
}

function Results({ records, events, params }: { records: AlertRecord[]; events: MarkEvent[]; params: Params }) {
  const items: Entry[] = [
    ...records.map((r): Entry => ({ id: `a${r.id}`, at: "alert", record: r, event: null, techName: r.change.techName, kind: r.kind, decision: null, judgedAt: r.createdAt, reason: null })),
    ...records.filter((r) => r.judgment).map((r): Entry => ({ id: r.id, at: "judged", record: r, event: null, techName: r.change.techName, kind: r.kind, decision: r.judgment!.decision, judgedAt: r.judgment!.judgedAt, reason: r.judgment!.reason })),
    ...events.map((e): Entry => ({ id: `m${e.id}`, at: "mark", record: null, event: e, techName: e.technologies?.display_name ?? "(이름 없음)", kind: null, decision: e.new_status, judgedAt: e.created_at, reason: e.reason })),
  ].sort((a, b) => Date.parse(b.judgedAt) - Date.parse(a.judgedAt));
  const shown = filterHistory(items, parseHistoryFilter(params, new Date()));
  return (
    <>
      <form className="filters" aria-label="일지 찾기">
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
            if (item.at === "alert") return <AlertRow key={item.id} record={item.record!} note="알림이 옴" />;
            const view = toAlertView(item.record!);
            return (
              <li key={item.id}>
                <Link className="alert-row" href={`/alerts/${item.record!.id}`}>
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
  return <div className="notice notice-empty"><strong>아직 일지가 비어 있어요.</strong> 내 기술에 알림이 오거나 <Link href="/">지도</Link>에서 관심 · 적용 후보 · 보류를 고르면 여기에 남아요.</div>;
}

function LoadError() {
  return (
    <div className="notice notice-error" role="alert">
      <strong>기록을 불러오지 못했어요.</strong> 기록이 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/history">다시 불러오기</Link>
    </div>
  );
}
