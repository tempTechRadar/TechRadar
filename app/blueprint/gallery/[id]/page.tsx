// 템플릿 열기 화면(P-12f 조각 G 화면, PRD-F48 "이 조합 써봤어요"): 템플릿 한 개 + 사용기(도움 순 위 3개, "모두 보기") · 도움이 됐어요 · 신고 · 쓰기.
// 열 수 있는 템플릿 = 내 것이거나 공개(DB 함수 blueprint_template_for_use, 손님은 공개만). 사용기는 손님도 읽는다(M6: 공개 템플릿의 숨기지 않은 글, 안전한 칸만 —
// 사용자 결정 "템플릿 사용기는 공개 템플릿에 쓰는 글이라 손님에게 열림"). 쓰기 · 도움이 됐어요 · 신고는 로그인.
// 쓰기는 그 템플릿으로 청사진을 확정해 본 사람만, 작가 · 시연 계정은 못 쓴다: 화면은 같은 DB 함수(can_note_template)로 쓰기 칸을 보일지 정하고, 진짜 막기는 insert 정책(불변 5)
import Link from "next/link";
import { notFound } from "next/navigation";
import { PreviewOnly } from "@/app/dev/preview-only";
import { toBoardView } from "@/lib/blueprint/graph";
import { orderNotes, TOP_NOTES } from "@/lib/blueprint/note-view";
import { isPreviewUser } from "@/lib/dev/login-preview";
import { isUuid } from "@/lib/domain/my-tech-view";
import { readTemplateForUse } from "@/lib/server/blueprint-templates";
import { getCurrentUser } from "@/lib/server/current-user";
import { canNoteTemplate, readTemplateNotes, TEMPLATE_NOTES_LIMIT } from "@/lib/server/template-notes";
import type { UsageNoteView } from "@/lib/server/usage-notes";
import { getServerSupabase } from "@/lib/supabase/server";
import { NoteButtons, NoteForm } from "./note-parts";
import "../gallery.css";

export const metadata = { title: "템플릿 · TechRadar" };
const KIND_KO = { frame: "틀", combo: "조합" } as const;
const day = (iso: string) => iso.slice(0, 10);
const line = { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const;

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ all?: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getCurrentUser();
  if (user && isPreviewUser(user)) return <PreviewOnly title="템플릿" />; // 미리보기(개발용)는 DB를 부르지 않는다
  const db = await getServerSupabase();
  // 셋을 함께 시작한다(사용기 RLS가 열린 템플릿만 주므로 템플릿을 먼저 기다릴 필요 없음). 관문 목록(outsideGate)은 이 화면에 안 쓰니 손님 모드로 읽는다
  const [t, notes, can] = db ? await Promise.all([
    readTemplateForUse(db, id, true).catch((e) => { console.error("템플릿 열기 실패", e instanceof Error ? e.message : e); return undefined; }),
    readTemplateNotes(db, id, user?.id ?? null).catch((e) => { console.error("템플릿 사용기 조회 실패", e instanceof Error ? e.message : e); return null; }),
    user ? canNoteTemplate(db, id).catch((e) => { console.error("사용기 쓰기 가능 조회 실패", e instanceof Error ? e.message : e); return null; }) : false,
  ]) : [undefined, null, false];
  if (t === null) notFound(); // 없거나 닫힌 템플릿(있는지 드러내지 않음)
  if (!t) return <main className="page gl-page"><h1>템플릿</h1><div className="notice notice-error" role="alert"><strong>템플릿을 불러오지 못했어요.</strong> 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</div><p><Link href="/blueprint/gallery">갤러리로 돌아가기</Link></p></main>;
  const board = toBoardView(t.graph);
  const techs = [...new Set((board ?? [t.graph.stages]).flat().flatMap((s) => s.techs.map((x) => x.name)))]; // 갤러리 카드와 같은 순서(판 순서)
  return (
    <main className="page gl-page">
      <p className="muted"><Link href="/blueprint/gallery">← 갤러리</Link></p>
      <h1>{t.name}</h1>
      <p><span className="tag">{KIND_KO[t.kind]}</span> 단계 {t.graph.stages.length}개</p>
      {board ? <p className="gl-flow"><span className="sr-only">단계 순서: </span>{board.map((c) => c.map((s) => s.name).join(" · ")).join(" → ")}</p> : null}
      {techs.length ? <p className="gl-techs"><span className="sr-only">기술: </span>{techs.join(" · ")}</p> : null}
      <p className="gl-actions"><Link className="btn btn-primary" href={`/blueprint?template=${t.id}`}>이 템플릿으로 시작</Link></p>
      <Notes templateId={t.id} notes={notes} all={(await searchParams).all === "1"} can={can} login={Boolean(user)} />
    </main>
  );
}

/** notes: null = 읽지 못함(없음과 다르게, 불변 2). login이 아니면 읽기만(도움 · 신고 · 쓰기는 로그인 안내).
 *  can: 쓸 수 있음(true) · 없음(false) · 모름(null — 쓰기 칸을 보이고 DB가 막음) */
function Notes({ templateId, notes, all, can, login }: { templateId: string; notes: UsageNoteView[] | null; all: boolean; can: boolean | null; login: boolean }) {
  const count = notes ? `${notes.length}${notes.length >= TEMPLATE_NOTES_LIMIT ? "개 넘게" : ""}` : "";
  const loginHref = `/login?next=${encodeURIComponent(`/blueprint/gallery/${templateId}`)}`;
  const shown = notes ? orderNotes(notes, all) : [];
  return (
    <article className="card" aria-labelledby="tnotes-title">
      <h2 id="tnotes-title">이 조합 써봤어요{notes ? ` (${count})` : ""}</h2>
      <p className="muted">이 템플릿으로 청사진을 만들어 본 사람이 남긴 글이에요. 쓴 사람은 보이지 않고, 글 내용은 확인된 사실이 아니에요.</p>
      {notes === null ? <p className="notice notice-error" role="alert">사용기를 불러오지 못했어요. 없는 게 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>
        : notes.length === 0 ? <p className="notice notice-empty">아직 사용기가 없어요.</p>
        : <ul className="alert-list">{shown.map((n) => (
          <li key={n.id}>
            <p className="muted">사용자 · {day(n.createdAt)}{n.mine ? " · 내 글" : ""}</p>
            <p style={line}><strong>무엇에 썼나</strong> {n.usedFor}</p>
            <p style={line}><strong>결과</strong> {n.result}</p>
            <p style={line}><strong>팁</strong> {n.tip}</p>
            {login ? <NoteButtons noteId={n.id} count={n.helpfulCount} mine={n.mine} voted={n.voted} reported={n.reported} /> : <p className="muted">도움이 됐어요 {n.helpfulCount}</p>}
          </li>
        ))}</ul>}
      {notes && notes.length > TOP_NOTES ? <p>{all ? <Link href={`/blueprint/gallery/${templateId}`}>도움 많은 {TOP_NOTES}개만 보기</Link> : <Link href={`/blueprint/gallery/${templateId}?all=1`}>사용기 {count}{notes.length >= TEMPLATE_NOTES_LIMIT ? "" : "개"} 모두 보기</Link>}</p> : null}
      {!login ? <p className="notice notice-empty">로그인하면 도움이 됐어요 · 신고를 누르고, 이 템플릿으로 확정해 본 뒤 사용기를 남길 수 있어요. <Link href={loginHref}>로그인</Link></p>
        : notes?.some((n) => n.mine) ? <p className="muted">이 템플릿에 사용기를 남겼어요. 한 템플릿에 한 번이에요.</p>
        : can === false ? <p className="muted">이 템플릿으로 청사진을 확정해 본 사람만 사용기를 남길 수 있어요(내 템플릿 · 시연 계정은 쓰지 않아요). <Link href={`/blueprint?template=${templateId}`}>이 템플릿으로 시작</Link></p> : <>
        <h3>사용기 남기기</h3>
        <p className="muted">이 템플릿으로 청사진을 확정해 본 뒤에 쓸 수 있어요. 한 템플릿에 한 번이에요.</p>
        <NoteForm templateId={templateId} />
      </>}
    </article>
  );
}
