import Link from "next/link";
import { redirect } from "next/navigation";
import { countPending, filterAlerts } from "@/lib/alerts/filter-alerts";
import { parseAlertFilter } from "@/lib/alerts/parse-alert-filter";
import { toAlertView } from "@/lib/alerts/to-alert-view";
import { listMyAlerts } from "@/lib/server/alert-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { chipHref, currentOf } from "@/lib/alerts/alert-chips";
import { FilterSelect, KIND_OPTIONS, PERIOD_OPTIONS } from "./filter-select";
import "./alerts.css";

// 알림 목록(IA-6, PRD-F14). 판단 버튼은 P-8, 대응안 초안은 P-13에서 상세에 붙인다.
type Params = { kind?: string; status?: string; period?: string; project?: string };

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
  // 칩의 수는 지금 거르기(종류·프로젝트·기간) 안에서 센다: 누르면 보이는 줄 수와 같게
  const inScope = filterAlerts(records, parseAlertFilter({ ...params, status: "" }, new Date()));
  const scopedPending = countPending(inScope);
  const now = { status: currentOf(params.status, ["pending", "done"]), kind: currentOf(params.kind, ["security", "opportunity", "model_eol"]) };
  const chip = (key: "status" | "kind", value: string, label: string) => (
    <Link className="chip" href={chipHref(params, key, value)} aria-current={now[key] === value ? "true" : undefined}>{label}</Link>
  );
  return (
    <>
      <p className="muted">내 판단이 필요한 것만 와요. 같은 변경은 알림 하나예요.</p>
      <p className="summary">
        {pending > 0 ? <><strong>{pending}건</strong> 판단 대기 중이에요.</> : <>판단 기다리는 알림이 없어요.</>}
      </p>
      <nav className="alert-chips" aria-label="빠른 거르기">
        <div role="group" aria-label="상태">{chip("status", "pending", `판단 대기 ${scopedPending}`)}{chip("status", "done", `완료 ${inScope.length - scopedPending}`)}{chip("status", "", `상태 전체 ${inScope.length}`)}</div>
        <div role="group" aria-label="종류">{chip("kind", "security", "보안 경고")}{chip("kind", "opportunity", "적용 기회")}{chip("kind", "model_eol", "모델 종료")}{chip("kind", "", "종류 전체")}</div>
      </nav>
      {/* 칩으로 주소가 바뀌면 고르기 칸도 새 값으로(key가 바뀌면 다시 그림) */}
      <form key={JSON.stringify(params)} className="filters" aria-label="알림 거르기">
        <FilterSelect label="종류" name="kind" value={params.kind} options={KIND_OPTIONS} />
        <FilterSelect label="상태" name="status" value={params.status} options={[["", "전체"], ["pending", "판단 대기"], ["done", "완료"]]} />
        <FilterSelect label="프로젝트" name="project" value={params.project} options={projectOptions(records)} />
        <FilterSelect label="기간" name="period" value={params.period} options={PERIOD_OPTIONS} />
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
                <span className="alert-main"><strong>{a.title}</strong><span className="muted">{a.subtitle}</span>{a.tags.length ? <span className="alert-tags">{a.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span> : null}</span>
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

// 알림이 하나라도 있는 프로젝트만 고를 수 있게 한다(없는 프로젝트를 고르면 늘 빈 목록).
function projectOptions(records: Awaited<ReturnType<typeof listMyAlerts>>): [string, string][] {
  const named = new Map<string, string>();
  for (const r of records) if (r.projectId && r.projectName) named.set(r.projectId, r.projectName);
  return [["", "전체"], ...named.entries()];
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
