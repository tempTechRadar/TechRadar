// 템플릿 갤러리(P-12e, ADR 0035 · 0036): 다른 사람이 공개한 청사진 틀 · 조합을 둘러보고 "이 템플릿으로 시작"한다.
// 사람 정보는 별명과 쓰인 수뿐(DB 함수 public_blueprint_templates, author_id 없음). 로그인 전에도 본다(P-12f M6, 손님 토큰으로 같은 함수).
import Link from "next/link";
import { isPreviewUser } from "@/lib/dev/login-preview";
import type { TemplateKind } from "@/lib/blueprint/graph";
import { readGalleryFacets, readPublicTemplates, type PublicTemplate } from "@/lib/server/blueprint-templates";
import { arrangeGallery, galleryFields, parseSort, type GallerySort } from "@/lib/blueprint/gallery";
import { getServiceSupabase } from "@/lib/server/service-supabase";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { HideButton } from "./hide-button";
import "./gallery.css";

export const metadata = { title: "템플릿 갤러리 · TechRadar" };

const KIND_KO: Record<TemplateKind, string> = { frame: "틀", combo: "조합" };
const FILTERS: [TemplateKind | null, string][] = [[null, "전체"], ["frame", "틀 · 단계와 연결만"], ["combo", "조합 · 단계와 기술"]];

/** 단계 흐름을 한 줄 글로: 같은 순서(동시)는 " · ", 다음 순서는 " → " */
const flowText = (t: PublicTemplate) => t.board.map((col) => col.map((s) => s.name).join(" · ")).join(" → ");
const techNames = (t: PublicTemplate) => [...new Set(t.board.flat().flatMap((s) => s.techs.map((x) => x.name)))];

function Card({ t, admin }: { t: PublicTemplate; admin: boolean }) {
  const techs = techNames(t);
  return (
    <li className="gl-card">
      <div className="gl-head">
        <span className="tag">{KIND_KO[t.kind]}</span>
        <h2 className="gl-name">{t.name}</h2>
      </div>
      <p className="gl-meta">{t.authorNickname} · 이 템플릿으로 시작한 청사진 {t.uses}개 · 단계 {t.graph.stages.length}개</p>
      <p className="gl-flow"><span className="sr-only">단계 순서: </span>{flowText(t)}</p>
      {techs.length ? <p className="gl-techs"><span className="sr-only">기술: </span>{techs.slice(0, 8).join(" · ")}{techs.length > 8 ? ` 외 ${techs.length - 8}개` : ""}</p> : null}
      <div className="gl-actions">
        <Link className="chip" href={`/blueprint?template=${t.id}`} aria-label={`${t.name} 템플릿으로 시작`}>이 템플릿으로 시작</Link>
        {admin ? <HideButton id={t.id} name={t.name} /> : null}
      </div>
    </li>
  );
}

const SORTS: [GallerySort, string][] = [["uses", "많이 쓴 순"], ["helpful", "도움 순"]];
/** 지금 고른 것을 지키며 하나만 바꾼 주소 */
const href = (q: { kind: string | null; field: string | null; sort: GallerySort }) => {
  const p = new URLSearchParams();
  if (q.kind) p.set("kind", q.kind);
  if (q.field) p.set("field", q.field);
  if (q.sort !== "uses") p.set("sort", q.sort);
  return p.size ? `/blueprint/gallery?${p}` : "/blueprint/gallery";
};

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ kind?: string; field?: string; sort?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const kind = params.kind === "frame" || params.kind === "combo" ? params.kind : null;
  const preview = !!user && isPreviewUser(user);
  const db = preview ? null : await getServerSupabase(); // 미리보기(개발용)는 DB 없이 빈 갤러리
  const list = !db ? (preview ? [] : null)
    : await readPublicTemplates(db, kind).catch((e) => { console.error("템플릿 갤러리 조회 실패", e instanceof Error ? e.message : e); return null; });
  const asked = parseSort(params.sort);
  // 분야 · 도움(P-12f 9): 카탈로그는 로그인이면 내 토큰, 손님이면 서버 키(공개 목록만). 못 읽으면 거르기 · 도움 순 없이 많이 쓴 순
  const catalog = user ? db : getServiceSupabase();
  const facets = list?.length && db && catalog ? await readGalleryFacets(catalog, db, list).catch((e) => { console.error("갤러리 분야 · 도움 조회 실패", e instanceof Error ? e.message : e); return null; }) : null;
  const fields = facets ? galleryFields(facets) : [];
  const field = typeof params.field === "string" && fields.some(([f]) => f === params.field) ? params.field : null;
  const sort: GallerySort = facets ? asked : "uses"; // 도움을 못 읽었으면 실제로 보이는 순서(많이 쓴 순)를 칩에도
  const shown = list ? arrangeGallery(list, facets, { field, sort }) : null;
  return (
    <main className="page gl-page">
      <h1>템플릿 갤러리</h1>
      <p className="muted">다른 사람이 공개한 청사진이에요. 보이는 사람 정보는 별명뿐이에요. 내 템플릿은 청사진 화면의 템플릿 탭에서 공개할 수 있어요.</p>
      <nav aria-label="템플릿 종류" className="gl-filters">
        {FILTERS.map(([k, label]) => (
          <Link key={label} className="chip" href={href({ kind: k, field, sort })} aria-current={k === kind ? "true" : undefined}>{label}</Link>
        ))}
      </nav>
      {list?.length ? <nav aria-label="정렬" className="gl-filters">
        {SORTS.map(([s, label]) => <Link key={s} className="chip" href={href({ kind, field, sort: s })} aria-current={s === sort ? "true" : undefined}>{label}</Link>)}
      </nav> : null}
      {fields.length ? <nav aria-label="분야" className="gl-filters">
        <Link className="chip" href={href({ kind, field: null, sort })} aria-current={!field ? "true" : undefined}>모든 분야</Link>
        {fields.map(([f, n]) => <Link key={f} className="chip" href={href({ kind, field: f, sort })} aria-current={f === field ? "true" : undefined}>{f} {n}</Link>)}
      </nav> : null}
      {list?.length && !facets ? <p className="muted" role="status">분야 · 도움을 읽지 못해 거르기 없이 많이 쓴 순으로 보여요.</p> : null}
      {list === null ? <div className="notice notice-error" role="alert"><strong>템플릿을 불러오지 못했어요.</strong> 템플릿이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div>
        : list.length === 0 ? <p className="notice notice-empty">아직 공개된 템플릿이 없어요. <Link href="/blueprint">청사진</Link>에서 템플릿으로 저장한 뒤 공개해 보세요.</p>
        : <ul className="gl-list">{(shown ?? list).map((t) => <Card key={t.id} t={t} admin={user?.role === "admin"} />)}</ul>}
      <p><Link href="/blueprint">청사진으로 돌아가기</Link></p>
    </main>
  );
}
