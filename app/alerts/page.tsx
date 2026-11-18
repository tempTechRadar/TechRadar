import Link from "next/link";
import { redirect } from "next/navigation";
import { countPending, filterAlerts } from "@/lib/alerts/filter-alerts";
import { parseAlertFilter } from "@/lib/alerts/parse-alert-filter";
import { toAlertView } from "@/lib/alerts/to-alert-view";
import { listMyAlerts } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import "./alerts.css";

// 알림 목록(IA-6, PRD-F14). 판단 버튼은 P-8, 대응안 초안은 P-13에서 상세에 붙인다.
type Params = { kind?: string; status?: string; period?: string };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const supabase = (await getServerSupabase())!;
  const records = await listMyAlerts(supabase, user.id).catch((e) => { console.error("알림 목록 조회 실패", e); return null; });

  return (
    <main className="alerts">
      <h1>알림</h1>
      {records === null ? <LoadError /> : records.length === 0 ? <Empty /> : <List records={records} params={params} />}
    </main>
  );
}

function List({ records, params }: { records: Awaited<ReturnType<typeof listMyAlerts>>; params: Params }) {
  const shown = filterAlerts(records, parseAlertFilter(params, new Date())).map(toAlertView);
  const pending = countPending(records);
  return (
    <>
      <p className="summary">
        {pending > 0 ? <><strong>{pending}건</strong> 판단 대기 중이에요.</> : <>판단 기다리는 알림이 없어요.</>}
      </p>
      <form className="filters" aria-label="알림 거르기">
        <Select label="종류" name="kind" value={params.kind} options={[["", "전체"], ["security", "보안 경고"], ["opportunity", "적용 기회"]]} />
        <Select label="상태" name="status" value={params.status} options={[["", "전체"], ["pending", "판단 대기"], ["done", "완료"]]} />
        <Select label="기간" name="period" value={params.period} options={[["", "전체"], ["7d", "최근 7일"], ["30d", "최근 30일"]]} />
        <button type="submit" className="btn">거르기</button>
      </form>
      {shown.length === 0 ? (
        <div className="notice notice-empty"><strong>이 조건에 맞는 알림이 없어요.</strong> <Link href="/alerts">거르기 풀기</Link></div>
      ) : (
        <ul className="alert-list">
          {shown.map((a) => (
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

function Select({ label, name, value, options }: { label: string; name: string; value?: string; options: [string, string][] }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ""}>
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}

function Empty() {
  return <div className="notice notice-empty"><strong>아직 알림이 없어요.</strong> 내 기술에 위험이 생기면 여기에서 알려 드려요.</div>;
}

function LoadError() {
  return (
    <div className="notice notice-error" role="alert">
      <strong>알림을 불러오지 못했어요.</strong> 알림이 없는 게 아니에요. 잠시 뒤에 다시 불러와 주세요. <Link href="/alerts">다시 불러오기</Link>
    </div>
  );
}
