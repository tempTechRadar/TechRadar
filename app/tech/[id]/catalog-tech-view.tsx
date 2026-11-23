import Link from "next/link";
import type { ReactNode } from "react";
import { GRADE_TONE, gradeText } from "@/lib/domain/my-tech-view";
import { fixedNote } from "@/lib/domain/services";
import { koreanTime } from "@/lib/flow/run-list";
import { GRADE_KO, KIND_KO } from "@/lib/map/build-map";
import type { CatalogTechDetail } from "@/lib/server/catalog-tech";
import type { NoteSummary } from "@/lib/server/usage-notes";

// 카탈로그 기술 상세의 본문(design.md 17절 2차). 머리 + 2단은 내 기술 상세와 같은 틀, 읽기만 하는 화면 조각.
const NONE = "확인하지 못함";
const MARK_KO = { interest: "관심", candidate: "적용 후보", hold: "보류" } as const;
const STATUS_KO: Record<string, string> = { deprecated: "지원 종료", dormant: "활동 멈춤", gone: "사라짐" };
const when = (iso: string | null) => (iso ? koreanTime(iso) : NONE);

/** star = 이름 옆 관심 별, markBar = 청사진 담기 줄(못 읽었으면 그 안내), usingText = 쓰고 있어요 한 줄, notes = 사용기 요약(null = 읽지 못함), guest = 로그인 전(P-12f) */
export function CatalogTechView({ d, star, markBar, usingText, notes, guest = false }: { d: CatalogTechDetail; star?: ReactNode; markBar: ReactNode; usingText: string; notes?: NoteSummary | null; guest?: boolean }) {
  const t = d.tech;
  const note = t.oneLiner ? null : fixedNote(t.techKey);
  return (
    <main className="page tech-detail">
      <header className="td-head">
        <p className="muted"><a href={`/?sel=${encodeURIComponent(`tech:${t.id}`)}`}>← 지도에서 보기</a></p>
        <div className="td-title"><h1>{t.name}</h1>{star}</div>
        <p>
          <span className={`badge badge-${GRADE_TONE[t.grade]}`}>{gradeText(t.grade, t.techKey, t.type)}</span>{" "}
          {t.collectErrorKind ? <span className="badge badge-warning">수집 오류</span> : null}{" "}
          {d.mine.length ? <span className="badge badge-neutral">내 기술 · 쓰는 중</span> : null}{" "}
          {STATUS_KO[t.status] ? <span className="badge badge-warning">{STATUS_KO[t.status]}</span> : null}
        </p>
        {t.oneLiner ? <p>{t.oneLiner}</p> : note ? <p>{note.text}{note.source ? <> (<a href={note.source} target="_blank" rel="noopener noreferrer">공식 레지스트리</a>)</> : null}</p> : null}
        {markBar}
      </header>

      <div className="td-cols">
        <aside className="td-info" aria-label="핵심 정보">
          <article className="card" aria-labelledby="info-title">
            <h2 id="info-title">핵심 정보</h2>
            <dl className="kv">
              <dt>종류</dt><dd>{KIND_KO[t.type] ?? t.type}</dd>
              <dt>저장소</dt><dd>{t.repoUrl?.startsWith("https://") ? <a href={t.repoUrl} target="_blank" rel="noopener noreferrer">{t.repoUrl}</a> : NONE}</dd>
              <dt>라이선스</dt><dd>{t.license ?? NONE}</dd>
              <dt>최근 활동</dt><dd>{t.lastActivityAt ? `${when(t.lastActivityAt)} (${t.lastActivityKind === "release" ? "릴리스" : "커밋"})` : NONE}</dd>
              <dt>공식 여부</dt><dd>{t.isOfficial ? "공식" : "공식 표시 없음"}</dd>
              <dt>정보를 마지막으로 확인한 시각</dt><dd>{when(t.lastCheckedOkAt)}</dd>
            </dl>
            <p>{usingText}</p>
            {d.mine.length ? (
              <>
                <h3>내 프로젝트에서</h3>
                <ul>{d.mine.map((m) => <li key={m.id}><Link href={`/projects/tech/${m.id}`}>{m.projectName || "내 기술"} · 내 버전 · 사용기</Link></li>)}</ul>
              </>
            ) : null}
          </article>
          {guest ? null : <article className="card" aria-labelledby="history-title">
            <h2 id="history-title">내 판단 기록</h2>
            {d.events.length ? (
              <ol>{d.events.map((e, i) => <li key={i}>{when(e.at)} · {e.status ? MARK_KO[e.status] : "표시 지움"}{e.reason ? ` · ${e.reason}` : ""}</li>)}</ol>
            ) : <p className="muted">아직 이 기술에 남긴 판단이 없어요.</p>}
          </article>}
        </aside>
        <div className="td-left">
          <article className="card" aria-labelledby="grade-title">
            <h2 id="grade-title">보안 · 수집 상태</h2>
            <p>{t.gradeReason ?? (t.type === "concept" ? "작업 방식이라 보안 등급이 없어요." : "확인할 수 있는 자료를 찾지 못했어요")}</p>
            {t.collectErrorKind ? <p className="notice notice-error" role="note">지금은 확인하지 못했어요. 위 등급은 마지막으로 확인에 성공한 시각({when(t.lastCheckedOkAt)}) 기준이에요.</p> : null}
          </article>
          <article className="card" aria-labelledby="peer-title">
            <h2 id="peer-title">비교군 {d.peers.length}</h2>
            {d.peers.length ? (
              <ul>{d.peers.map((p) => (
                <li key={p.id}>
                  <Link href={`/tech/${p.id}`}>{p.name}</Link>{p.grade === "danger" || p.grade === "caution" ? <span className="tag"> {GRADE_KO[p.grade as "danger" | "caution"]}</span> : null}
                  <span className="muted"> · 왜: {p.quote ?? "근거를 아직 적지 않았어요"} · 관리자 확인{p.confirmedAt ? ` ${when(p.confirmedAt)}` : ""}</span>
                </li>
              ))}</ul>
            ) : <p className="muted">관리자가 확인한 비교군이 아직 없어요.</p>}
            {d.peers.length && d.mine.length ? <p><Link href={`/compare`}>내 기술과 비교군 비교하기</Link></p> : null}
          </article>
          <article className="card" aria-labelledby="notes-title">
            {/* 사용기 읽기(P-24, 쓴 사람은 보이지 않음). 손님에게는 수만(글은 로그인 사용자에게만, 11-22 사용자 결정). 쓰기 · 도움이 됐어요는 내 기술 상세에서 */}
            <h2 id="notes-title">사용기 {notes ? notes.total : ""}</h2>
            {notes === null || notes === undefined ? <p className="notice notice-error" role="alert">사용기를 불러오지 못했어요. 없다는 뜻이 아니에요. 잠시 뒤 새로 고쳐 주세요.</p>
              : guest ? <p className="muted">{notes.total ? <>사용기 {notes.total}개 — <Link href={`/login?next=${encodeURIComponent(`/tech/${t.id}`)}`}>로그인</Link>하면 볼 수 있어요.</> : <>아직 사용기가 없어요. <Link href={`/login?next=${encodeURIComponent(`/tech/${t.id}`)}`}>로그인</Link>하면 내 프로젝트에 넣고 사용기를 쓸 수 있어요.</>}</p>
              : notes.top.length ? <ul>{notes.top.map((n) => <li key={n.id}><b>{n.usedFor}</b> · {n.result} · 팁: {n.tip}<span className="muted"> · 도움이 됐어요 {n.helpfulCount}</span></li>)}</ul>
              : <p className="muted">아직 사용기가 없어요.</p>}
          </article>
        </div>
      </div>
    </main>
  );
}
