import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/server/current-user";
import { readRecommendations } from "@/lib/server/recommend-queries";
import { getServerSupabase } from "@/lib/supabase/server";
import "../alerts/alerts.css";

// 추천(IA-20, PRD-F32): 취향의 관심 분야 안에서 주간 다운로드가 많은 기술. 알림·판단과 따로이고 알림 수·판단 대기 수에 들어가지 않는다.
export default async function RecommendPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/recommend");
  const supabase = (await getServerSupabase())!;
  const view = await readRecommendations(supabase, user.id, user.isDemo).catch((e) => { console.error("추천 조회 실패", e); return null; });
  return (
    <main className="alerts">
      <h1>추천</h1>
      <p className="muted">알림이 아니에요. 고른 관심 분야에서 주간 다운로드가 많은 기술이에요. 이미 쓰는 기술과 지원이 끝난 기술은 빼요. <Link href="/taste">취향 고치기</Link></p>
      {view === null ? (
        <div className="notice notice-error" role="alert"><strong>추천을 불러오지 못했어요.</strong> 잠시 뒤에 다시 열어 주세요.</div>
      ) : view.taste === null || view.taste.interests.length === 0 ? (
        <div className="notice notice-empty"><strong>관심 분야를 고르면 추천이 나와요.</strong> <Link href="/taste">취향 알려 주기</Link></div>
      ) : view.items.length === 0 ? (
        <div className="notice notice-empty"><strong>고른 분야에 보여 줄 기술이 아직 없어요.</strong> 분야를 바꾸거나 나중에 다시 봐 주세요.</div>
      ) : (
        <ul className="alert-list">
          {view.items.map((r) => (
            <li key={r.techId}>
              <Link href={`/tech/${r.techId}`}><strong>{r.name}</strong></Link>
              {r.oneLiner ? <p>{r.oneLiner}</p> : null}
              <p className="muted">이유: {r.reason}{r.source ? ` · 출처: ${r.source}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
