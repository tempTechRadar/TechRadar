import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/my-tech-view";
import { PreviewOnly } from "@/app/dev/preview-only";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { getCurrentUser } from "@/lib/server/current-user";
import { getMyTechDetail, recordGradeView, type MyTechDetail } from "@/lib/server/my-tech";
import { readUsageNotes, type UsageNoteView } from "@/lib/server/usage-notes";
import { readUsingNow } from "@/lib/server/using-now";
import { getServerSupabase } from "@/lib/supabase/server";
import { readMarkForTech } from "@/lib/server/marks";
import { MarkBar } from "./mark-bar";
import { TechDetail } from "./tech-detail";
import { UsageNotes } from "./usage-notes";

// 기술 상세(IA-4, PRD-F10). 열 때마다 등급 이유를 열어 본 기록(grade_views, 주 숫자)을 남긴다.
export default async function TechDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (isPreviewUser(user)) return <PreviewOnly title="기술 상세" />; // 미리보기(개발용)는 DB를 부르지 않는다
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = (await getServerSupabase())!;
  let detail: MyTechDetail | null;
  try {
    detail = await getMyTechDetail(supabase, user.id, id);
  } catch (e) {
    console.error("기술 상세 조회 실패", e);
    return <LoadError />;
  }
  if (!detail) notFound();
  // 이름만 직접 추가한 기술은 카탈로그에 이어져 있지 않아(tech_id 없음) 열람 기록을 남길 수 없다.
  if (detail.technologies) await recordGradeView({ db: supabase, audit: null, userId: user.id }, detail.technologies.id);
  // 쓰고 있어요(PRD-F34) · 사용기(PRD-F35) · 내 판단 표시는 서로 기다리지 않게 한꺼번에 읽는다. 카탈로그에 이어진 기술만.
  // 어느 것을 못 읽어도 기술 상세는 그대로 보여 주고(로그는 남김) 그 칸만 "불러오지 못했어요"(0명 · 없음 · 빈 단추로 단정하지 않음, 불변 2)
  let using: { count: number; nicknames: string[] } | null | undefined;
  let notes: UsageNoteView[] | null = null;
  let markBar = null;
  if (detail.technologies) {
    const techId = detail.technologies.id;
    const [u, n, m] = await Promise.all([
      readUsingNow(supabase, techId),
      readUsageNotes(supabase, techId, user.id).catch((e) => { console.error("사용기 조회 실패", e); return null; }),
      readMarkForTech(supabase, user.id, techId).catch((e) => { console.error("내 판단 표시 조회 실패", e instanceof Error ? e.message : e); return null; }),
    ]);
    if (u.ok) using = { count: u.count, nicknames: u.nicknames };
    else { console.error(u.error); using = null; }
    notes = n;
    // 등급은 DB 규칙(set_tech_mark)과 같은 카탈로그 등급: 이 프로젝트 줄의 등급과 다를 수 있다
    markBar = m
      ? <MarkBar techId={techId} grade={m.grade} initial={m.mark} />
      : <p className="notice notice-error" role="alert">내 판단 표시를 불러오지 못했어요. 판단이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>;
  }
  return (
    <TechDetail d={detail} using={using} markBar={markBar}>
      {detail.technologies ? <UsageNotes techId={detail.technologies.id} pathId={id} notes={notes} /> : null}
    </TechDetail>
  );
}

function LoadError() {
  return (
    <main className="page">
      <p className="muted"><Link href="/dashboard">← 프로젝트 관리로</Link></p>
      <p className="notice notice-error" role="alert">기술 정보를 불러오지 못했어요(조회 실패). 잠시 뒤 새로 고쳐 주세요.</p>
    </main>
  );
}
