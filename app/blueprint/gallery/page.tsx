// 템플릿 갤러리(P-12e, ADR 0035 · 0036): 다른 사람이 공개한 청사진 틀 · 조합을 둘러보고 "이 템플릿으로 시작"한다.
// 사람 정보는 별명과 쓰인 수뿐(DB 함수 public_blueprint_templates, author_id 없음). 로그인 전에는 그 자리 안내.
import Link from "next/link";
import { isPreviewUser } from "@/lib/dev/login-preview";
import type { TemplateKind } from "@/lib/blueprint/graph";
import { readPublicTemplates, type PublicTemplate } from "@/lib/server/blueprint-templates";
import { getCurrentUser } from "@/lib/server/current-user";
import { getServerSupabase } from "@/lib/supabase/server";
import { backTo, LoginNeeded } from "../../login/login-needed";
import { HideButton } from "./hide-button";
import "../../alerts/alerts.css";
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

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user) return <LoginNeeded title="템플릿 갤러리" why="로그인하면 다른 사람이 공개한 청사진 틀 · 조합을 둘러보고 내 청사진으로 시작할 수 있어요." next={backTo("/blueprint/gallery", params)} />;
  const kind = params.kind === "frame" || params.kind === "combo" ? params.kind : null;
  const db = isPreviewUser(user) ? null : await getServerSupabase(); // 미리보기(개발용)는 DB 없이 빈 갤러리
  const list = !db ? (isPreviewUser(user) ? [] : null)
    : await readPublicTemplates(db, kind).catch((e) => { console.error("템플릿 갤러리 조회 실패", e instanceof Error ? e.message : e); return null; });
  return (
    <main className="alerts gl-page">
      <h1>템플릿 갤러리</h1>
      <p className="muted">다른 사람이 공개한 청사진이에요. 보이는 사람 정보는 별명뿐이에요. 내 템플릿은 청사진 화면의 템플릿 탭에서 공개할 수 있어요.</p>
      <nav aria-label="템플릿 종류" className="gl-filters">
        {FILTERS.map(([k, label]) => (
          <Link key={label} className="chip" href={k ? `/blueprint/gallery?kind=${k}` : "/blueprint/gallery"} aria-current={k === kind ? "true" : undefined}>{label}</Link>
        ))}
      </nav>
      {list === null ? <div className="notice notice-error" role="alert"><strong>템플릿을 읽지 못했어요.</strong> 템플릿이 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div>
        : list.length === 0 ? <p className="notice notice-empty">아직 공개된 템플릿이 없어요. 청사진에서 템플릿으로 저장한 뒤 공개해 보세요.</p>
        : <ul className="gl-list">{list.map((t) => <Card key={t.id} t={t} admin={user.role === "admin"} />)}</ul>}
      <p><Link href="/blueprint">청사진으로 돌아가기</Link></p>
    </main>
  );
}
