import Link from "next/link";
import { notFound } from "next/navigation";
import { isUuid } from "@/lib/domain/my-tech-view";
import { getCatalogTechDetail, type CatalogTechDetail } from "@/lib/server/catalog-tech";
import { PreviewOnly } from "@/app/dev/preview-only";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { getCurrentUser } from "@/lib/server/current-user";
import { readMarkForTech } from "@/lib/server/marks";
import { readUsingNow } from "@/lib/server/using-now";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { readTopUsageNotes, readUsageNoteCount } from "@/lib/server/usage-notes";
import { usingNowText } from "@/lib/views/using-now-text";
import { MarkBar } from "../../projects/tech/[id]/mark-bar";
import { CatalogTechView } from "./catalog-tech-view";

// 카탈로그 기술 상세(design.md 17절 2차 "지도의 모든 기술에 상세가 열림", IA-4). 머리 + 2단은 내 기술 상세와 같은 틀.
// 내 기술이면 프로젝트 줄의 상세(버전 · 내 등급 · 사용기)로 가는 길을 함께 보인다.
// 로그인 전(P-12f 손님)에도 연다: 카탈로그 칸은 서버 키로 공개 목록만, 사용기는 수만(글은 로그인 사용자에게만, 11-22 사용자 결정), 판단 · 내 기술 · 내 판단 기록은 없음(불변 5).

export default async function CatalogTechPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getCurrentUser();
  if (user && isPreviewUser(user)) return <PreviewOnly title="기술 상세" />; // 미리보기(개발용)는 DB를 부르지 않는다
  const own = await getServerSupabase(); // 로그인했으면 내 토큰, 아니면 손님 토큰(사용기 수)
  const db = user ? own : getServiceSupabase();
  if (!db) return <LoadError id={id} />;
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
  const [mark, using, notes] = await Promise.all([
    user ? readMarkForTech(db, user.id, id).catch((e) => { console.error("내 판단 표시 조회 실패", e instanceof Error ? e.message : e); return null; }) : null,
    // "쓰고 있어요"(별명 · 수)는 로그인한 사람에게만(using_now는 anon에 닫혀 있다): 서버 키로 손님에게 돌려 열지 않는다
    user ? readUsingNow(db, id) : null,
    !own ? null : user ? readTopUsageNotes(own, id).catch((e) => { console.error("사용기 조회 실패", e instanceof Error ? e.message : e); return null; })
      : readUsageNoteCount(own, id).then((total) => ({ total, top: [] }), (e) => { console.error("사용기 수 조회 실패", e instanceof Error ? e.message : e); return null; }),
  ]);
  if (using && !using.ok) console.error(using.error);
  const markBar = !user ? <p className="muted">판단(관심 · 적용 후보 · 보류)은 <Link href={`/login?next=${encodeURIComponent(`/tech/${id}`)}`}>로그인</Link>하면 남길 수 있어요.</p>
    : mark ? <MarkBar techId={d.tech.id} grade={mark.grade} initial={mark.mark} />
    : <p className="notice notice-error" role="alert">내 판단 표시를 불러오지 못했어요. 판단이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>;
  return <CatalogTechView d={d} markBar={markBar} usingText={!using ? "로그인하면 이 기술을 쓰고 있는 사람 수가 보여요." : usingNowText(using.ok ? { count: using.count, nicknames: using.nicknames } : null)} notes={notes} guest={!user} />;
}

function LoadError({ id }: { id: string }) {
  return (
    <main className="page">
      <title>기술 상세 · TechRadar</title>
      <h1>기술 상세</h1>
      <p className="notice notice-error" role="alert">기술 정보를 불러오지 못했어요. 없는 게 아니에요. <Link href={`/tech/${id}`}>다시 불러오기</Link></p>
    </main>
  );
}
