// 보기 바꾸기(PRD-F36·F37·F34, 3순위): 갤러리 · 내 레이더 · 소식판 · 쓰고 있어요. 본인 데이터만(RLS + 아래 조건, 불변 5).
import Link from "next/link";
import { redirect } from "next/navigation";
import { galleryCards, type GalleryRow } from "@/lib/views/gallery";
import { buildRadar, type RadarAlert } from "@/lib/views/radar";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { Gallery, NewsPlaceholder, Radar, UsingNowPlaceholder } from "./view-parts";

const TABS = [["gallery", "갤러리"], ["radar", "내 레이더"], ["news", "소식판"], ["using", "쓰고 있어요"]] as const;
type Tab = (typeof TABS)[number][0];

type MyTech = {
  id: string; version: string | null; grade: GalleryRow["grade"]; grade_reason: string | null; collect_error_kind: string | null;
  last_checked_ok_at: string | null; manual_name: string | null;
  technologies: { display_name: string } | null; projects: { name: string } | null;
};
type JudgmentRow = { decision: "candidate" | "hold"; judged_at: string };
// judgments.alert_id가 unique라 한 줄 객체로 올 수도, 배열로 올 수도 있다(타입 생성 전)
type AlertRow = { my_technology_id: string | null; created_at: string; judgments: JudgmentRow | JudgmentRow[] | null };
const firstJudgment = (j: AlertRow["judgments"]) => (Array.isArray(j) ? j[0] : j) ?? null;

export default async function ViewsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getServerSupabase();
  if (!db) return <main><h1>보기</h1><p>Supabase 연결 전이에요.</p></main>;
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "gallery";

  const techRes = await db.from("my_technologies")
    .select("id, version, grade, grade_reason, collect_error_kind, last_checked_ok_at, manual_name, technologies(display_name), projects(name)")
    .eq("owner_id", user.id).is("hidden_at", null);
  const alertRes = await db.from("alerts").select("my_technology_id, created_at, judgments(decision, judged_at)").eq("user_id", user.id);
  // DB 타입을 생성하기 전이라 다대일도 배열로 추론된다. 실제 응답은 한 줄 객체
  const techs = (techRes.data ?? []) as unknown as MyTech[];
  const rows: GalleryRow[] = techs.map((t) => ({
    id: t.id, name: t.technologies?.display_name ?? t.manual_name ?? "(이름 없음)", version: t.version, grade: t.grade, gradeReason: t.grade_reason,
    collectErrorKind: t.collect_error_kind, lastCheckedOkAt: t.last_checked_ok_at, projectName: t.projects?.name ?? "",
  }));
  const alerts: RadarAlert[] = ((alertRes.data ?? []) as unknown as AlertRow[])
    .filter((a) => a.my_technology_id)
    .map((a) => {
      const j = firstJudgment(a.judgments);
      return { myTechnologyId: a.my_technology_id!, createdAt: a.created_at, judgment: j ? { decision: j.decision, judgedAt: j.judged_at } : null };
    });
  const readError = techRes.error?.message ?? alertRes.error?.message;

  return (
    <main>
      <p><Link href="/projects">← 내 프로젝트</Link></p>
      <h1>보기</h1>
      <nav aria-label="보기 바꾸기" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
        {TABS.map(([k, name]) => (
          <Link key={k} href={`/views?tab=${k}`} aria-current={k === tab ? "page" : undefined}
            style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 14px", borderRadius: 999, border: "1px solid #b9b4a8", fontWeight: k === tab ? 700 : 400, background: k === tab ? "#2c2a26" : "#fff", color: k === tab ? "#fff" : "#2c2a26", textDecoration: "none" }}>
            {name}
          </Link>
        ))}
      </nav>
      {readError ? <p role="alert" style={{ color: "#b3261e" }}>목록을 읽지 못했어요(없는 게 아니라 조회 실패). 잠시 뒤 새로 고쳐 주세요.</p> : null}
      {tab === "gallery" ? <Gallery cards={galleryCards(rows)} /> : null}
      {tab === "radar" ? <Radar rings={buildRadar(rows.map((r) => ({ id: r.id, label: r.name, grade: r.grade })), alerts)} /> : null}
      {tab === "news" ? <NewsPlaceholder /> : null}
      {tab === "using" ? <UsingNowPlaceholder /> : null}
    </main>
  );
}
