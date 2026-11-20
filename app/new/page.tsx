// 새 기술(ADR 0028 4, design.md 13절 3): 처음 채운 뒤 7일 안에 들어온 공개 목록 기술을 하는 일 갈래별로, 갈래마다 10개 + 더 보기.
// 줄마다 한 줄 소개 · 종류 · 보안, 지도에서 보기 · 관심. 본인 표시만 읽는다(불변 5).
import Link from "next/link";
import { buildTechMap, GRADE_KO } from "@/lib/map/build-map";
import { getCurrentUser } from "@/lib/server/current-user";
import { NEW_LIMIT, NEW_RULE_VERSION, readNewTechs, TECH_COLUMNS } from "@/lib/server/map-queries";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { unstable_cache } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { groupByField } from "@/lib/views/new-techs";
import { InterestButton } from "./interest-button";
import "../alerts/alerts.css";
import "./new.css";

const PER_GROUP = 10;

// 로그인 전에도 연다(11-21 사용자 결정, ADR 0029와 같은 방식): 누구에게나 같은 공개 목록이라 10분 동안 한 번만 읽는다(실패는 기억하지 않음)
const readGuestNew = unstable_cache(async () => {
  const db = getServiceSupabase();
  if (!db) throw new Error("서비스 키 설정이 없음");
  return readNewTechs(db, null, new Date());
}, ["guest-new", TECH_COLUMNS, NEW_RULE_VERSION], { revalidate: 600 });

export default async function NewTechPage({ searchParams }: { searchParams: Promise<{ more?: string }> }) {
  const user = await getCurrentUser();
  const { more } = await searchParams;
  const input = await (user ? readNewTechs((await getServerSupabase())!, user.id, new Date()) : readGuestNew())
    .catch((e: unknown) => { console.error("새 기술 조회 실패", e instanceof Error ? e.message : e); return null; });
  const groups = input ? groupByField(buildTechMap(input, new Date()).nodes) : null;

  return (
    <main className="alerts new-page">
      <h1>새 기술</h1>
      <p className="muted">이번 주(7일 안)에 모은 기술이에요. 공식 목록에서 온 것만 보여요. 알림이 아니라 둘러보는 곳이에요.{user ? null : <> <Link href="/login?next=/new">로그인</Link>하면 관심을 남길 수 있어요.</>}</p>
      {input && input.techs.length >= NEW_LIMIT ? <p className="notice notice-empty" role="status">최근 {NEW_LIMIT}개만 보여요. 더 오래된 이번 주 기술은 <Link href="/">기술 지도</Link>에서 찾아 보세요.</p> : null}
      {groups === null ? (
        <div className="notice notice-error" role="alert"><strong>새 기술을 읽지 못했어요.</strong> 새 기술이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div>
      ) : groups.length === 0 ? (
        <div className="notice notice-empty"><strong>이번 주에 새로 들어온 기술이 아직 없어요.</strong> 매일 아침 모으면 여기에 보여요. 처음 모은 기술은 <Link href="/">기술 지도</Link>에서 볼 수 있어요.</div>
      ) : groups.map((g, gi) => {
        const open = more === g.field, id = `g-${gi}`; // 갈래 이름에 빈칸이 있어도 되는 id
        return (
          <section key={g.field} className="new-group" aria-labelledby={id}>
            <h2 id={id}>{g.field} <span className="muted">{g.nodes.length}</span></h2>
            <ul>{(open ? g.nodes : g.nodes.slice(0, PER_GROUP)).map((n) => (
              <li key={n.key} className="new-row">
                <div className="new-main">
                  <b>{n.name}</b>
                  <span className="muted">{[n.attrs.kind, n.attrs.sub !== "분류 전" ? n.attrs.sub : null].filter(Boolean).join(" · ")}</span>
                  {n.oneLiner ? <span>{n.oneLiner}</span> : null}
                </div>
                {n.grade === "danger" || n.grade === "caution" ? <span className={`badge ${n.grade === "danger" ? "badge-danger" : "badge-warning"}`}>{n.grade === "danger" ? "✕" : "!"} {GRADE_KO[n.grade]}</span> : null}
                {n.collectErrorKind ? <span className="badge badge-neutral">수집 오류</span> : null}
                <span className="new-actions">
                  <Link className="btn" href={`/?sel=${encodeURIComponent(n.key)}`}>지도에서 보기</Link>
                  {n.techId && user ? <InterestButton techId={n.techId} initial={n.mark?.status ?? null} /> : null}
                </span>
              </li>
            ))}</ul>
            {g.nodes.length > PER_GROUP ? (open
              ? <Link href="/new">접기</Link>
              : <Link href={`/new?more=${encodeURIComponent(g.field)}#${id}`}>{g.field} {g.nodes.length - PER_GROUP}개 더 보기</Link>) : null}
          </section>
        );
      })}
    </main>
  );
}
