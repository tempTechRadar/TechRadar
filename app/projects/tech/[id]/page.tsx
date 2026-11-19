import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/my-tech-view";
import { getCurrentUser } from "@/lib/server/current-user";
import { getMyTechDetail, recordGradeView, type MyTechDetail } from "@/lib/server/my-tech";
import { getServerSupabase } from "@/lib/supabase/server";
import "../../../alerts/alerts.css";
import { TechDetail } from "./tech-detail";

// 기술 상세(IA-4, PRD-F10). 열 때마다 등급 이유를 열어 본 기록(grade_views, 주 숫자)을 남긴다.
export default async function TechDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
  return <TechDetail d={detail} />;
}

function LoadError() {
  return (
    <main className="alerts">
      <p className="muted"><Link href="/projects">← 내 프로젝트로</Link></p>
      <p className="notice notice-error" role="alert">기술 정보를 불러오지 못했어요(조회 실패). 잠시 뒤 새로 고쳐 주세요.</p>
    </main>
  );
}
