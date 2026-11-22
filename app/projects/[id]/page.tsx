import Link from "next/link";
import { notFound } from "next/navigation";
import { toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import { repoCards } from "@/lib/dashboard/status-view";
import { repoMetaLine } from "@/lib/dashboard/repo-summary";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_DASHBOARD, SAMPLE_MARK_EVENTS, SAMPLE_STATUS } from "@/lib/dev/preview-data";
import { isUuid } from "@/lib/domain/my-tech-view";
import { listMyAlerts } from "@/lib/server/alert-queries";
import { readMarkMap, readMoveProgress, type MoveProgress } from "@/lib/server/board-queries";
import { getCurrentUser } from "@/lib/server/current-user";
import { readRepoDetail, type RepoDetailRow } from "@/lib/server/repo-detail";
import { getServerSupabase } from "@/lib/supabase/server";
import { ManageNotices, type ManageQuery } from "../../dashboard/repo-manage";
import { LoginNeeded } from "../../login/login-needed";
import { registerProject } from "../actions";
import { ProjectManage } from "../project-manage";
import { RereadButton } from "../reread-button";
import { RepoTechTable } from "../tech-table";
import "../../dashboard/board.css";

// 레포 상세(P-12k K2, IA-3 · PRD-F4 · F22 개정: 프로젝트 거르기를 이 페이지가 대신). 보드 "진행 중 프로젝트" 판의 이름 · 숫자 띠 "사용 중인 항목"에서 온다.
// 본인 것 · 보관 안 한 레포만(owner_id 조건 + RLS, 불변 5), 없거나 남의 id면 404. 못 읽으면 "읽지 못함"(없음과 다르게, 불변 2). 보드와 같은 컴팩트 판 모양(13px · 28px).
// 다시 읽기 · 숨기기 · 이름 고치기는 이 페이지로 돌아온다(폼의 from = 레포 id, backPath). 보관하면 보드로.
export const metadata = { title: "레포 상세 · TechRadar" };
export const maxDuration = 300; // [다시 읽기](서버 액션)가 여기서 돈다: 보드와 같은 시간

const LINES = 5;
const short = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const when = (iso: string) => short.format(new Date(iso));

export default async function RepoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ManageQuery> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="레포 상세" why="로그인하면 내가 등록한 레포와 그 레포에서 쓰는 항목을 여기서 봐요." next={`/projects/${encodeURIComponent(id)}`} />;
  let repo: RepoDetailRow | null | "failed", alerts: AlertRecord[] | null, move: MoveProgress | null, marks: Map<string, string> | null;
  if (isPreviewUser(user)) { // 미리보기(개발용)는 DB를 부르지 않고 샘플(id p1 · p2)로
    const p = SAMPLE_STATUS.projects.find((x) => x.id === id);
    repo = p ? { ...p, memo: null } : null;
    [alerts, move, marks] = [SAMPLE_DASHBOARD.alerts, { candidates: 3, blueprints: [] }, new Map(SAMPLE_MARK_EVENTS.map((e) => [e.tech_id, e.new_status]))];
  } else {
    if (!isUuid(id)) notFound();
    const db = (await getServerSupabase())!;
    const fail = (what: string) => (e: unknown) => { console.error(`레포 상세: ${what} 조회 실패`, e instanceof Error ? e.message : e); return null; };
    [repo, alerts, move, marks] = await Promise.all([
      readRepoDetail(db, user.id, id).catch((e) => { fail("레포")(e); return "failed" as const; }),
      listMyAlerts(db, user.id).catch(fail("알림")), readMoveProgress(db, user.id).catch(fail("청사진")), readMarkMap(db, user.id).catch(fail("판단 표시")),
    ]);
  }
  if (repo === "failed") return <Shell title="레포 상세"><p className="board-fail" role="alert">— 이 레포를 읽지 못했어요. 없다는 뜻이 아니에요. <Link href={`/projects/${id}`}>다시 불러오기</Link></p></Shell>;
  if (!repo) notFound();
  return <Detail p={repo} query={query} alerts={alerts} move={move} marks={marks} />;
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="page board-page repo-page"><p className="muted"><Link href="/dashboard#w-repos">← 프로젝트 관리</Link></p><h1>{title}</h1>{children}</main>;
}

/** 판 하나(보드의 걸린 판과 같은 모양, 끌기 없음) */
function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section className="bw" aria-labelledby={id}><header className="bw-bar"><h2 id={id} className="bw-title">{title}</h2></header><div className="bw-body">{children}</div></section>;
}

function Detail({ p, query, alerts, move, marks }: { p: RepoDetailRow; query: ManageQuery; alerts: AlertRecord[] | null; move: MoveProgress | null; marks: Map<string, string> | null }) {
  const now = new Date(), card = repoCards([p], now)[0], meta = repoMetaLine(p, now);
  const shown = p.my_technologies.filter((t) => !t.hidden_at), hidden = p.my_technologies.filter((t) => t.hidden_at);
  const mine = alerts?.filter((a) => a.projectId === p.id).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)) ?? null;
  const pending = mine?.filter((a) => a.status === "pending") ?? null, done = mine?.filter((a) => a.status !== "pending") ?? null;
  const bps = move?.blueprints.filter((b) => b.projectId === p.id) ?? null;
  const AlertLines = ({ rows, empty, more }: { rows: AlertRecord[]; empty: string; more: string }) => rows.length ? <>
    <ul className="board-lines">{rows.slice(0, LINES).map((r) => { const a = toAlertView(r); return <li key={a.id}><span className="board-src">{a.kindLabel}</span><Link href={`/alerts/${a.id}`}>{a.title}</Link><time className="muted" dateTime={a.createdAt}>{when(a.createdAt)}</time></li>; })}</ul>
    {rows.length > LINES ? <p><Link href={more}>{rows.length}건 모두 보기</Link></p> : null}</> : <p className="board-empty">{empty}</p>;
  return (
    <Shell title={p.name}>
      <ManageNotices query={query} />
      <div className="repo-head">
        {p.memo ? <p className="muted">메모: {p.memo}</p> : null}
        {p.repo_url || meta?.info ? <p>{p.repo_url ? <><a href={p.repo_url} target="_blank" rel="noopener noreferrer">{p.repo_url.replace("https://github.com/", "")}<span className="sr-only">(새 창)</span></a>{meta?.info ? " · " : ""}</> : null}{meta?.info}</p> : null}
        {meta?.error ? <p className="board-fail" role="status">— {meta.error}</p> : null}
        <p>마지막 읽기 {card.lastReadAt ? when(card.lastReadAt) : "기록 없음"} · 사용 중인 항목 {card.techCount}{card.errorCount ? <span className="board-warn"> · 수집 오류 {card.errorCount}개(지난 값을 보여 줘요)</span> : null}</p>
        {card.notice ? <p className="board-fail" role="status">— {card.notice}</p> : null}
        <div className="board-actions">
          {p.repo_url ? <form action={registerProject}><input type="hidden" name="repoUrl" value={p.repo_url} /><input type="hidden" name="from" value={p.id} /><RereadButton /></form> : null}
          {p.kind === "repo" ? <ProjectManage project={{ id: p.id, name: p.name, memo: p.memo }} /> : null}
        </div>
      </div>
      <Panel id="r-techs" title={`사용 중인 항목 ${shown.length}`}>
        {shown.length ? <RepoTechTable techs={shown} alerts={mine} marks={marks} from={p.id} caption={`${p.name}의 사용 중인 항목`} />
          : <p className="board-empty">{card.notice ? "마지막 읽기가 끝까지 되지 않아 목록이 비었을 수 있어요." : "이 레포에서 읽은 항목이 아직 없어요."} <Link href="/dashboard#w-add">직접 추가</Link></p>}
        {hidden.length ? <details className="archive-box"><summary>숨긴 항목 {hidden.length}</summary>
          <p className="muted">다시 읽어도 되살아나지 않아요. 되돌리면 다시 보여요.</p>
          <RepoTechTable techs={hidden} alerts={mine} marks={marks} from={p.id} caption={`${p.name}의 숨긴 항목`} /></details> : null}
      </Panel>
      <div className="repo-grid">
        <Panel id="r-pending" title={`판단 대기${pending ? ` ${pending.length}` : ""}`}>
          {pending ? <AlertLines rows={pending} empty="이 레포에서 판단을 기다리는 알림이 없어요." more={`/alerts?status=pending&project=${p.id}`} /> : <p className="board-fail" role="alert">— 판단 대기를 읽지 못했어요. 없다는 뜻이 아니에요.</p>}
        </Panel>
        <Panel id="r-changed" title="바뀐 것(판단 끝남)">
          {done ? <AlertLines rows={done} empty="판단을 끝낸 변경이 아직 없어요." more={`/alerts?status=done&project=${p.id}`} /> : <p className="board-fail" role="alert">— 바뀐 것을 읽지 못했어요. 없다는 뜻이 아니에요.</p>}
        </Panel>
        <Panel id="r-bp" title="이 레포의 확정 청사진">
          {bps === null ? <p className="board-fail" role="alert">— 확정한 청사진을 읽지 못했어요. 없다는 뜻이 아니에요.</p>
            : bps.length ? <ul className="board-lines">{bps.slice(0, LINES).map((b) => <li key={b.id}><span className="board-src">청사진</span><span>{b.name}</span><time className="muted" dateTime={b.createdAt}>{when(b.createdAt)}</time></li>)}</ul>
            : <p className="board-empty">이 레포로 확정한 청사진이 없어요.</p>}
          <p className="board-actions"><Link className="btn btn-sm" href="/blueprint">청사진 열기</Link></p>
        </Panel>
      </div>
    </Shell>
  );
}
