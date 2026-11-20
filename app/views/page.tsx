// 내 레이더(ADR 0028 3: 대시보드 IA-5를 이 화면이 맡음) = 위 숫자(내 기술 · 판단 대기 · 판단 완료) + 판단 상태 칸반.
// 다른 보기(PRD-F36·F37·F34, 3순위): 갤러리 · 소식판 · 쓰고 있어요. 본인 데이터만(RLS + 아래 조건, 불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import { summarizeDashboard } from "@/lib/alerts/summarize-dashboard";
import { readDashboardData } from "@/lib/server/dashboard-queries";
import { galleryCards, type GalleryRow } from "@/lib/views/gallery";
import { buildKanban, type KanbanInput } from "@/lib/views/kanban";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { Kanban } from "./kanban";
import { Gallery, NewsPlaceholder, UsingNowPlaceholder } from "./view-parts";
import "../alerts/alerts.css";
import "./views.css";

const TABS = [["radar", "내 레이더"], ["gallery", "갤러리"], ["news", "소식판"], ["using", "쓰고 있어요"]] as const;
type Tab = (typeof TABS)[number][0];
type Grade = GalleryRow["grade"];
type TechRef = { display_name: string; grade: Grade } | null;

type MyTech = {
  id: string; tech_id: string | null; version: string | null; grade: Grade; grade_reason: string | null; collect_error_kind: string | null;
  last_checked_ok_at: string | null; manual_name: string | null; technologies: { display_name: string } | null; projects: { name: string } | null;
};
type MarkRow = { tech_id: string; status: "interest" | "candidate" | "hold"; reason: string | null; updated_at: string; technologies: TechRef };
type JudgmentRow = { decision: "candidate" | "hold"; reason: string | null; judged_at: string };
// judgments.alert_id가 unique라 한 줄 객체로 올 수도, 배열로 올 수도 있다(타입 생성 전)
type AlertRow = { status: "pending" | "done"; changes: { tech_id: string; technologies: TechRef } | null; judgments: JudgmentRow | JudgmentRow[] | null };
const one = <T,>(j: T | T[] | null) => (Array.isArray(j) ? j[0] : j) ?? null;

export default async function ViewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/views");
  const db = await getServerSupabase();
  if (!db) return <main className="alerts"><h1>내 레이더</h1><p>Supabase 연결 전이에요.</p></main>;
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "radar";

  // DB 타입을 생성하기 전이라 다대일도 배열로 추론된다. 실제 응답은 한 줄 객체
  const [techRes, markRes, alertRes, dash] = await Promise.all([
    db.from("my_technologies")
      .select("id, tech_id, version, grade, grade_reason, collect_error_kind, last_checked_ok_at, manual_name, technologies(display_name), projects!inner(name, archived_at)")
      .eq("owner_id", user.id).is("hidden_at", null).is("projects.archived_at", null), // 지도와 같은 범위: 보관한 프로젝트는 뺀다
    db.from("tech_marks").select("tech_id, status, reason, updated_at, technologies(display_name, grade)").eq("user_id", user.id),
    db.from("alerts").select("status, changes(tech_id, technologies(display_name, grade)), judgments(decision, reason, judged_at)").eq("user_id", user.id),
    readDashboardData(db, user.id).catch((e: unknown) => { console.error("내 레이더 숫자 조회 실패", e instanceof Error ? e.message : e); return null; }),
  ]);
  const techs = (techRes.data ?? []) as unknown as MyTech[];
  const alerts = (alertRes.data ?? []) as unknown as AlertRow[];
  const readError = techRes.error ?? markRes.error ?? alertRes.error;
  const nameOf = (t: TechRef) => t?.display_name ?? "(이름 없음)";

  const kanban: KanbanInput = {
    mine: techs.map((t) => ({ id: t.id, techId: t.tech_id, name: t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", grade: t.grade, projectName: t.projects?.name ?? "" })),
    marks: ((markRes.data ?? []) as unknown as MarkRow[]).map((m) => ({ techId: m.tech_id, name: nameOf(m.technologies), grade: m.technologies?.grade ?? "unknown", status: m.status, reason: m.reason, updatedAt: m.updated_at })),
    judged: alerts.flatMap((a) => {
      const j = one(a.judgments);
      return j && a.changes ? [{ techId: a.changes.tech_id, name: nameOf(a.changes.technologies), grade: a.changes.technologies?.grade ?? "unknown", decision: j.decision, reason: j.reason, judgedAt: j.judged_at }] : [];
    }),
  };
  const rows: GalleryRow[] = techs.map((t) => ({
    id: t.id, name: t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", version: t.version, grade: t.grade, gradeReason: t.grade_reason,
    collectErrorKind: t.collect_error_kind, lastCheckedOkAt: t.last_checked_ok_at, projectName: t.projects?.name ?? "",
  }));
  // 숫자는 대시보드와 같은 계산(IA-5: 내 기술 수 · 변경 수 · 판단 대기 / 완료, ADR 0028 3)
  const sum = dash ? summarizeDashboard({ alerts: dash.alerts, techs: dash.techs, params: {}, now: new Date() }) : null;

  return (
    <main className="alerts views-page">
      <h1>내 레이더</h1>
      {sum ? (
        <div className="stat-grid">
          <Link className="stat" href={sum.links.techs}><span className="muted">내 기술</span><strong>{sum.techCount}</strong></Link>
          <Link className="stat" href={sum.links.changes}><span className="muted">최근 변경</span><strong>{sum.changeCount}</strong></Link>
          <Link className="stat" href={sum.links.pending}><span className="muted">판단 대기</span><strong>{sum.pendingCount}</strong></Link>
          <Link className="stat" href={sum.links.done}><span className="muted">판단 완료</span><strong>{sum.doneCount}</strong></Link>
        </div>
      ) : <div className="notice notice-error" role="alert"><strong>숫자를 읽지 못했어요.</strong> 0이라는 뜻이 아니에요. <Link href="/dashboard">대시보드</Link>에서 다시 보세요.</div>}
      {readError ? <div className="notice notice-error" role="alert"><strong>목록을 읽지 못했어요.</strong> 없는 게 아니라 조회에 실패했어요. 잠시 뒤 새로 고쳐 주세요.</div> : null}
      <nav aria-label="보기 바꾸기" className="views-tabs">
        {TABS.map(([k, name]) => <Link key={k} href={`/views?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{name}</Link>)}
        <Link href="/dashboard">대시보드</Link>
        <Link href="/compare">기술 비교</Link>
      </nav>
      {readError ? null : (
        <>
          {tab === "radar" ? <Kanban columns={buildKanban(kanban)} /> : null}
          {tab === "gallery" ? <Gallery cards={galleryCards(rows)} /> : null}
          {tab === "news" ? <NewsPlaceholder /> : null}
          {tab === "using" ? <UsingNowPlaceholder /> : null}
        </>
      )}
    </main>
  );
}
