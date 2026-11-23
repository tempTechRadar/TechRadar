// 프로젝트 관리 타공보드(P-12k K1 · K2): 숫자 띠 · ① 진행 중 프로젝트 판(이름 → 레포 상세 /projects/[id]) · 보관함. 서버 조각이라 각자 데이터를 기다리고(Suspense = "읽는 중"),
// 못 읽으면 "읽지 못함", 비었으면 "없음"을 따로 보인다(불변 2, 안내서 "데이터 없음과 조회 실패 구분"). 거르기 폼은 없고 띠의 기간 하나만 알림 숫자에 걸린다.
import Link from "next/link";
import { summarizeDashboard } from "@/lib/alerts/summarize-dashboard";
import type { AlertRecord } from "@/lib/alerts/to-alert-view";
import { repoCards } from "@/lib/dashboard/status-view";
import { repoMetaLine, repoSummary, type Battery } from "@/lib/dashboard/repo-summary";
import type { ArchivedRepo } from "@/lib/server/repo-detail";
import { GRADE_KO } from "@/lib/map/build-map";
import { NEW_QUOTA } from "@/lib/map/view-config";
import type { StatusData } from "@/lib/server/status-queries";
import { registerProject } from "../projects/actions";
import { RereadButton } from "../projects/reread-button";
import { ArchivedProjects } from "../projects/archived-projects";
import { PeriodSelect } from "./board-client";
import { RegisterForm } from "./repo-manage";

export const Reading = ({ what }: { what: string }) => <p className="board-empty" role="status">{what}을(를) 읽는 중…</p>;
/** 판 안 "없음" 한 모양 */
export const Empty = ({ children }: { children: React.ReactNode }) => <p className="board-empty">{children}</p>;
/** 판 안 "읽지 못함" 한 모양(없음과 다르게, 불변 2) */
export const Failed = ({ what }: { what: string }) => <p className="board-fail" role="alert">— {what}을(를) 읽지 못했어요. 없다는 뜻이 아니에요. <Link href="/dashboard">다시 불러오기</Link></p>;
/** 로그인 전: 내 데이터 판 자리 */
export const LoginFirst = () => <Empty>로그인하면 내 레포가 보여요. <Link href={`/login?next=${encodeURIComponent("/dashboard")}`}>로그인</Link></Empty>;

export const short = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const when = (iso: string) => short.format(new Date(iso));

/** 숫자 띠 값: 숫자, null = 읽지 못함, undefined = 로그인 전 */
type Cell = [label: string, value: number | null | undefined, href: string];

/** 숫자 띠(안내서 필수 대시보드): 6칸 = 누르면 가는 목록의 수(알림 칸은 summarizeDashboard = 알림 목록과 같은 거르기). 기간은 알림 칸(위험 · 판단 대기 · 완료)에 걸린다.
 *  "사용 중인 항목"은 레포가 하나면 그 레포 상세, 여럿이면 진행 중 프로젝트 판(레포마다 수) */
export async function Band({ alerts, status, newToday, period }: { alerts: Promise<AlertRecord[] | null> | null; status: Promise<StatusData | null> | null;
  newToday: Promise<number | null>; period: string }) {
  const [al, st, nt] = await Promise.all([alerts, status, newToday]);
  const now = new Date(), guest = alerts === null;
  const all = al ? summarizeDashboard({ alerts: al, techs: [], params: { period }, now }) : null;
  const risk = al ? summarizeDashboard({ alerts: al, techs: [], params: { period, kind: "security" }, now }) : null;
  const mine = <T,>(v: T | null) => (guest ? undefined : v);
  const cells: Cell[] = [
    ["오늘의 새 기술", nt, "/?t=day"],
    ["진행 중 프로젝트", mine(st ? st.projects.length : null), "#w-repos"],
    ["사용 중인 항목", mine(st ? repoCards(st.projects, now).reduce((n, c) => n + c.techCount, 0) : null), st?.projects.length === 1 ? `/projects/${st.projects[0].id}` : "#w-repos"],
    ["위험 발생", mine(risk ? risk.changeCount : null), risk?.links.changes ?? "/alerts?kind=security"],
    ["판단 대기", mine(all ? all.pendingCount : null), all?.links.pending ?? "/alerts?status=pending"],
    ["완료", mine(all ? all.doneCount : null), all?.links.done ?? "/alerts?status=done"],
  ];
  return (
    <div className="band">
      <ul className="band-cells" aria-label="숫자(누르면 그 목록)">{cells.map(([label, v, href]) => (
        <li key={label}><Link className="band-cell" href={href}><span className="band-label">{label}</span>
          {v == null ? <span className={v === null ? "band-fail" : "band-none"}>— {v === null ? "읽지 못함" : "로그인 필요"}</span> : <strong>{v}</strong>}
          {/* shortcut: 지도는 새 기술을 최근 NEW_QUOTA개까지만 올린다(map-queries). 늘 넘치면 지도 쪽에 전체 목록 보기를 둔다 */}
          {href === "/?t=day" && typeof v === "number" && v > NEW_QUOTA ? <span className="band-note">지도엔 최근 {NEW_QUOTA}</span> : null}</Link></li>
      ))}</ul>
      {guest ? null : <PeriodSelect value={period} />}
    </div>
  );
}

const GRADES: [keyof Battery, string][] = [["danger", "danger"], ["caution", "warning"], ["pass", "success"], ["unknown", "neutral"]];
/** 등급 미니 막대: 위험 · 주의 · 통과 · 찾지 못함 비율, 색만이 아니라 글자로 수를 같이(0은 줄여 뺌) */
function MiniBattery({ b }: { b: Battery }) {
  const total = b.danger + b.caution + b.pass + b.unknown;
  if (!total) return <span className="muted">—</span>;
  return (
    <span className="battery">
      <span className="battery-bar" aria-hidden="true">{GRADES.map(([g, tone]) => (b[g] ? <i key={g} className={`battery-${tone}`} style={{ flexGrow: b[g] }} /> : null))}</span>
      <span className="battery-text">{GRADES.filter(([g]) => b[g]).map(([g]) => `${GRADE_KO[g]} ${b[g]}`).join(" · ")}</span>
    </span>
  );
}

/** ① 진행 중 프로젝트: 레포마다 한 줄(이름 · 주 언어 · 사용 중인 항목 · 등급 · 판단 대기 · 마지막 읽기 · 다시 읽기) + 레포 등록 한 줄 + 보관함. 이름 = 레포 상세(K2) */
export async function ReposBody({ status, alerts, archived }: { status: Promise<StatusData | null>; alerts: Promise<AlertRecord[] | null>; archived: Promise<ArchivedRepo[] | null> }) {
  const [st, al, ar] = await Promise.all([status, alerts, archived]);
  if (!st) return <><Failed what="내 레포" /><RegisterForm /><ArchivedProjects projects={ar} /></>;
  if (!st.projects.length) return <><Empty>아직 등록한 레포가 없어요. 아래에 공개 GitHub 저장소 주소를 넣어 주세요.</Empty><RegisterForm /><ArchivedProjects projects={ar} /></>;
  const now = new Date(), cards = new Map(repoCards(st.projects, now).map((c) => [c.id, c]));
  return (
    <>
      <table className="board-table repo-rows"><caption className="sr-only">진행 중 프로젝트</caption>
        <thead><tr><th scope="col">이름</th><th scope="col">주 언어</th><th scope="col">사용 중</th><th scope="col">등급</th><th scope="col">판단 대기</th><th scope="col">마지막 읽기</th><th scope="col"><span className="sr-only">다시 읽기</span></th></tr></thead>
        <tbody>{st.projects.map((p) => { const c = cards.get(p.id)!, s = repoSummary(p, al), meta = repoMetaLine(p, now); return (
          <tr key={p.id}>
            <th scope="row"><Link href={`/projects/${p.id}`}>{p.name}</Link>
              {meta?.error ? <span className="board-warn"> {meta.error}</span> : null}</th>
            <td>{p.repo_language ?? <span className="muted">—</span>}</td>
            <td>{c.techCount}</td>
            <td><MiniBattery b={s.battery} /></td>
            <td>{s.pending === null ? <span className="board-warn">못 읽음</span> : s.pending ? <Link href={`/alerts?status=pending&project=${p.id}`}>{s.pending}</Link> : 0}</td>
            <td>{c.lastReadAt ? when(c.lastReadAt) : <span className="muted">기록 없음</span>}{c.errorCount ? <span className="board-warn"> · 수집 오류 {c.errorCount}</span> : null}
              {c.notice ? <span className="board-warn"> {c.notice}</span> : null}</td>
            <td>{p.repo_url ? <form action={registerProject}><input type="hidden" name="repoUrl" value={p.repo_url} /><RereadButton compact /></form> : null}</td>
          </tr>
        ); })}</tbody>
      </table>
      <RegisterForm />
      <ArchivedProjects projects={ar} />
    </>
  );
}
