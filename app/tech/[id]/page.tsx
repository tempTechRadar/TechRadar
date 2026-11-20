import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isUuid } from "@/lib/domain/my-tech-view";
import { getCatalogTechDetail, type CatalogTechDetail } from "@/lib/server/catalog-tech";
import { getCurrentUser } from "@/lib/server/current-user";
import { readMarkForTech } from "@/lib/server/marks";
import { readUsingNow } from "@/lib/server/using-now";
import { getServerSupabase } from "@/lib/supabase/server";
import { usingNowText } from "@/lib/views/using-now-text";
import { MarkBar } from "../../projects/tech/[id]/mark-bar";
import { CatalogTechView } from "./catalog-tech-view";
import "../../alerts/alerts.css";

// 카탈로그 기술 상세(design.md 17절 2차 "지도의 모든 기술에 상세가 열림", IA-4). 머리 + 2단은 내 기술 상세와 같은 틀.
// 내 기술이면 프로젝트 줄의 상세(버전 · 내 등급 · 사용기)로 가는 길을 함께 보인다.

export default async function CatalogTechPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/tech/${id}`)}`); // 로그인 뒤 이 상세로 돌아온다
  const db = (await getServerSupabase())!;
  let d: CatalogTechDetail | null;
  try {
    d = await getCatalogTechDetail(db, user, id);
  } catch (e) {
    console.error("기술 상세 조회 실패", e instanceof Error ? e.message : e);
    return <LoadError id={id} />;
  }
  if (!d) notFound();
  // 등급 열람 기록(grade_views, PRD-F44 지표)은 내 버전의 등급 이유를 보는 내 기술 상세에서만 남긴다: 여기는 카탈로그 등급이라 지표가 부풀려진다
  // 판단 표시 · 쓰고 있어요는 못 읽어도 상세는 보이고 그 칸만 "읽지 못했어요"(불변 2)
  const [mark, using] = await Promise.all([
    readMarkForTech(db, user.id, id).catch((e) => { console.error("내 판단 표시 조회 실패", e instanceof Error ? e.message : e); return null; }),
    readUsingNow(db, id),
  ]);
  if (!using.ok) console.error(using.error);
  const markBar = mark ? <MarkBar techId={d.tech.id} grade={mark.grade} initial={mark.mark} />
    : <p className="notice notice-error" role="alert">내 판단 표시를 읽지 못했어요. 판단이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>;
  return <CatalogTechView d={d} markBar={markBar} usingText={usingNowText(using.ok ? { count: using.count, nicknames: using.nicknames } : null)} />;
}

function LoadError({ id }: { id: string }) {
  return (
    <main className="alerts">
      <p className="notice notice-error" role="alert">기술 정보를 불러오지 못했어요(조회 실패). 없는 게 아니에요. <Link href={`/tech/${id}`}>다시 불러오기</Link></p>
    </main>
  );
}
