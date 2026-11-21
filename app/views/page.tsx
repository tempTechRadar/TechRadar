// 보드(옛 내 레이더, 11-21 화면 개편 D) = 판단 상태 칸반(쓰는 중 · 관심 · 적용 후보 · 보류), 칸 안은 갈래 또는 내 태그로 묶음(?by=tag).
// 숫자 요약은 일지(/history) 맨 위로 옮김. 다른 보기(PRD-F36·F37·F34, 3순위): 갤러리 · 소식판 · 쓰고 있어요. 본인 데이터만(RLS + 아래 조건, 불변 5).
import Link from "next/link";
import { galleryCards, type GalleryRow } from "@/lib/views/gallery";
import { categoryNames, isConcept } from "@/lib/map/build-map";
import { readCategories } from "@/lib/server/map-queries";
import { readMyTechTagMap } from "@/lib/server/my-tech-tags";
import { buildKanban, type GroupBy, type KanbanInput } from "@/lib/views/kanban";
import { getCurrentUser } from "@/lib/server/current-user";
import { backTo, LoginNeeded } from "../login/login-needed";
import { getServerSupabase } from "@/lib/supabase/server";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { SAMPLE_GALLERY, SAMPLE_KANBAN, SAMPLE_TAGS } from "@/lib/dev/preview-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SpaceSwitch } from "../nav/space-switch";
import { Kanban } from "./kanban";
import { Gallery, NewsPlaceholder, UsingNowPlaceholder } from "./view-parts";
import "../alerts/alerts.css";
import "./views.css";

const TABS = [["radar", "보드"], ["gallery", "갤러리"], ["news", "소식판"], ["using", "쓰고 있어요"]] as const;
type Tab = (typeof TABS)[number][0];
type Grade = GalleryRow["grade"];
type TechRef = { display_name: string; grade: Grade; category_id: string | null } | null;

type MyTech = {
  id: string; tech_id: string | null; version: string | null; grade: Grade; grade_reason: string | null; collect_error_kind: string | null;
  last_checked_ok_at: string | null; manual_name: string | null; technologies: { display_name: string; tech_key: string; category_id: string | null } | null; projects: { name: string } | null;
};
type MarkRow = { tech_id: string; status: "interest" | "candidate" | "hold"; reason: string | null; updated_at: string; technologies: TechRef };
type JudgmentRow = { decision: "candidate" | "hold"; reason: string | null; judged_at: string };
// judgments.alert_id가 unique라 한 줄 객체로 올 수도, 배열로 올 수도 있다(타입 생성 전)
type AlertRow = { status: "pending" | "done"; changes: { tech_id: string; technologies: TechRef } | null; judgments: JudgmentRow | JudgmentRow[] | null };
const one = <T,>(j: T | T[] | null) => (Array.isArray(j) ? j[0] : j) ?? null;

/** 칸반 · 갤러리 · 갈래 · 내 태그를 한 번에 읽는다 */
async function readViews(db: SupabaseClient, userId: string) {
  // DB 타입을 생성하기 전이라 다대일도 배열로 추론된다. 실제 응답은 한 줄 객체
  const [techRes, markRes, alertRes, cats, tags] = await Promise.all([
    db.from("my_technologies")
      .select("id, tech_id, version, grade, grade_reason, collect_error_kind, last_checked_ok_at, manual_name, technologies(display_name, tech_key, category_id), projects!inner(name, archived_at)")
      .eq("owner_id", userId).is("hidden_at", null).is("projects.archived_at", null), // 지도와 같은 범위: 보관한 프로젝트는 뺀다
    db.from("tech_marks").select("tech_id, status, reason, updated_at, technologies(display_name, grade, category_id)").eq("user_id", userId),
    db.from("alerts").select("status, changes(tech_id, technologies(display_name, grade, category_id)), judgments(decision, reason, judged_at)").eq("user_id", userId),
    readCategories(db).catch((e: unknown) => { console.error("보드 갈래 조회 실패", e instanceof Error ? e.message : e); return null; }),
    readMyTechTagMap(db, userId).catch((e: unknown) => { console.error("보드 내 태그 조회 실패", e instanceof Error ? e.message : e); return null; }),
  ]);
  const techs = (techRes.data ?? []) as unknown as MyTech[];
  const alerts = (alertRes.data ?? []) as unknown as AlertRow[];
  const readError = techRes.error ?? markRes.error ?? alertRes.error;
  // 갈래 · 태그를 못 읽으면 "분류 안 됨" · "태그 없음"으로 묶지 않고 그 묶기만 읽지 못함으로(불변 2). 태그만 못 읽으면 갈래 묶기는 그대로
  const groupError = { field: !cats, tag: !cats || !tags };
  const nameOf = (t: TechRef) => t?.display_name ?? "(이름 없음)";
  const catMap = new Map((cats ?? []).map((c) => [c.id, c]));
  const fieldOf = (t: { category_id: string | null } | null) => categoryNames(t?.category_id ?? null, catMap).field;

  const kanban: KanbanInput = {
    mine: techs.map((t) => ({ id: t.id, techId: t.tech_id, name: t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", grade: t.grade, projectName: t.projects?.name ?? "", field: fieldOf(t.technologies) })),
    marks: ((markRes.data ?? []) as unknown as MarkRow[]).map((m) => ({ techId: m.tech_id, name: nameOf(m.technologies), grade: m.technologies?.grade ?? "unknown", status: m.status, reason: m.reason, updatedAt: m.updated_at, field: fieldOf(m.technologies) })),
    judged: alerts.flatMap((a) => {
      const j = one(a.judgments);
      return j && a.changes ? [{ techId: a.changes.tech_id, name: nameOf(a.changes.technologies), grade: a.changes.technologies?.grade ?? "unknown", decision: j.decision, reason: j.reason, judgedAt: j.judged_at, field: fieldOf(a.changes.technologies) }] : [];
    }),
  };
  const rows: GalleryRow[] = techs.map((t) => ({
    id: t.id, name: t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", version: t.version, grade: t.grade, gradeReason: t.grade_reason,
    collectErrorKind: t.collect_error_kind, lastCheckedOkAt: t.last_checked_ok_at, projectName: t.projects?.name ?? "", concept: isConcept(t.technologies?.tech_key),
  }));
  return { kanban, rows, readError, groupError, tags: Object.fromEntries(tags ?? []) };
}

export default async function ViewsPage({ searchParams }: { searchParams: Promise<{ tab?: string; by?: string }> }) {
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="보드" why="로그인하면 관심 두고, 써 볼 후보로 고르고, 쓰고 있는 기술이 여기에 모여요." next={backTo("/views", await searchParams)} />;
  const db = isPreviewUser(user) ? null : await getServerSupabase(); // 미리보기(개발용)는 DB 없이 샘플로
  if (!db && !isPreviewUser(user)) return <main className="alerts"><h1>보드</h1><p>Supabase 연결 전이에요.</p></main>;
  const { tab: raw, by: rawBy } = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "radar";
  const by: GroupBy = rawBy === "tag" ? "tag" : "field";

  const { kanban, rows, readError, groupError, tags } = db ? await readViews(db, user.id) : { kanban: SAMPLE_KANBAN, rows: SAMPLE_GALLERY, readError: null, groupError: { field: false, tag: false }, tags: SAMPLE_TAGS };

  return (
    <main className="alerts views-page">
      <SpaceSwitch />
      <h1>보드</h1>
      {readError ? <div className="notice notice-error" role="alert"><strong>목록을 읽지 못했어요.</strong> 없는 게 아니라 조회에 실패했어요. 잠시 뒤 새로 고쳐 주세요.</div> : null}
      <nav aria-label="보기 바꾸기" className="views-tabs">
        {TABS.map(([k, name]) => <Link key={k} href={k === "radar" ? `/views${by === "tag" ? "?by=tag" : ""}` : `/views?tab=${k}`} aria-current={k === tab ? "page" : undefined}>{name}</Link>)}
        <Link href="/recommend">추천</Link>{/* 메뉴에서 옮겨 옴(11-21, 메뉴 줄이기) */}
        <Link href="/dashboard">대시보드</Link>
        <Link href="/compare">기술 비교</Link>
        <Link href="/blueprint">청사진</Link>
      </nav>
      {readError ? null : (
        <>
          {/* 화면 읽기에서 제목 단계가 h1 → h3로 건너뛰지 않게 지금 보기 이름을 h2로(눈에는 탭이 보여 줌) */}
          <h2 className="sr-only">{TABS.find(([k]) => k === tab)?.[1]}</h2>
          {tab === "radar" ? (
            <>
              <nav aria-label="칸 안 묶기" className="views-tabs kb-by">
                <span className="muted">묶기</span>
                <Link href="/views" aria-current={by === "field" ? "page" : undefined}>갈래</Link>
                <Link href="/views?by=tag" aria-current={by === "tag" ? "page" : undefined}>내 태그</Link>
              </nav>
              {groupError[by] ? <div className="notice notice-error" role="alert"><strong>{by === "tag" ? "내 태그" : "갈래"}를 읽지 못해 보드를 묶지 못했어요.</strong>{by === "tag" ? <> <Link href="/views">갈래로 묶기</Link>는 그대로 쓸 수 있어요.</> : null} 없는 게 아니라 조회에 실패했어요. 잠시 뒤 새로 고쳐 주세요.</div>
                : <Kanban columns={buildKanban(kanban)} by={by} tags={tags} />}
            </>
          ) : null}
          {tab === "gallery" ? <Gallery cards={galleryCards(rows)} /> : null}
          {tab === "news" ? <NewsPlaceholder /> : null}
          {tab === "using" ? <UsingNowPlaceholder /> : null}
        </>
      )}
    </main>
  );
}
