import Link from "next/link";
import type { ReactNode } from "react";
import { COLLECT_ERROR_TEXT, evidenceLinks, GRADE_TONE, gradeText, ORIGIN_LABEL } from "@/lib/domain/my-tech-view";
import { koreanTime } from "@/lib/flow/run-list";
import type { MyTechDetail } from "@/lib/server/my-tech";
import { usingNowText, type UsingNowView } from "@/lib/views/using-now-text";
import { fixedNote } from "@/lib/domain/services";

// 기술 상세 본문(IA-4, PRD-F10). 읽기만 하는 화면 조각이라 page.tsx와 개발용 샘플 화면이 같이 쓴다.
// 틀은 머리 + 2단(design.md 18절): 머리 = 돌아가기 · 이름 · 배지 · 판단 줄(markBar), 왼쪽 = 보안 · 수집 상태와 사용기(children), 오른쪽 = 핵심 정보 · 내 목록 상태 · 쓰고 있어요.
// 아직 없는 것: 같은 역할의 기술(P-14·P-18 확정 뒤), 이 기술에 대한 내 판단 기록, 3순위 칸(사용기·비교 모드). 쓰고 있어요는 using_now 함수로(P-12a2).
const NONE = "확인하지 못함";
const when = (iso: string | null) => (iso ? koreanTime(iso) : NONE);

// using: 공개한 사람의 수·별명(null = 못 읽음, undefined = 카탈로그에 이어지지 않은 기술이라 해당 없음)
export function TechDetail({ d, using, markBar, children }: { d: MyTechDetail; using?: UsingNowView | null; markBar?: ReactNode; children?: ReactNode }) {
  const info = d.technologies;
  const note = fixedNote(info?.tech_key); // 연동 서비스 · 개념은 정해 둔 설명(카탈로그에 쓰지 않음)
  const name = info?.display_name ?? d.manual_name ?? "(이름 없음)";
  const evidence = evidenceLinks(d.grade_evidence);
  return (
    <main className="alerts tech-detail">
      <header className="td-head">
        <p className="muted">
          <Link href="/projects">← 내 프로젝트로</Link>
          {info ? <> · <a href={`/?sel=${encodeURIComponent(`tech:${info.id}`)}`}>지도에서 보기</a></> : null}
        </p>
        <h1>{name}</h1>
        <p>
          <span className={`badge badge-${GRADE_TONE[d.grade]}`}>{gradeText(d.grade, info?.tech_key, info?.type)}</span>{" "}
          {d.collect_error_kind && <span className="badge badge-warning">수집 오류</span>}{" "}
          {d.hidden_at && <span className="badge badge-neutral">직접 숨김</span>}
        </p>
        {info?.one_liner ? <p>{info.one_liner}</p> : note ? <p>{note.text}{note.source ? <> (<a href={note.source} target="_blank" rel="noopener noreferrer">공식 레지스트리</a>)</> : null}</p> : null}
        {markBar}
      </header>

      <div className="td-cols">
      <aside className="td-info" aria-label="핵심 정보">
      <article className="card" aria-labelledby="info-title">
        <h2 id="info-title">핵심 정보</h2>
        {info ? (
          <dl className="kv">
            <dt>종류</dt><dd>{info.type}</dd>
            <dt>상태</dt><dd>{info.status}</dd>
            <dt>저장소</dt>
            <dd>{info.repo_url?.startsWith("https://") ? <a href={info.repo_url} target="_blank" rel="noopener noreferrer">{info.repo_url}</a> : NONE}</dd>
            <dt>라이선스</dt><dd>{info.license ?? NONE}</dd>
            <dt>최근 활동</dt><dd>{info.last_activity_at ? `${when(info.last_activity_at)} (${info.last_activity_kind === "release" ? "릴리스" : "커밋"})` : NONE}</dd>
            <dt>공식 여부</dt><dd>{info.is_official ? "공식" : "공식 표시 없음"}</dd>
            <dt>정보를 마지막으로 확인한 시각</dt><dd>{when(info.last_checked_ok_at)}</dd>
          </dl>
        ) : (
          <p>이름만 직접 추가한 기술이라 모아 둔 정보가 없어요. 등급은 "찾지 못함"이고 보안 경고는 오지 않아요.</p>
        )}
        {using !== undefined ? <p>{usingNowText(using)}</p> : null}
      </article>
      </aside>
      <div className="td-left">
      <article className="card" aria-labelledby="grade-title">
        <h2 id="grade-title">등급과 이유</h2>
        <p>{d.grade_reason ?? "확인할 수 있는 자료를 찾지 못했어요"}</p>
        {d.collect_error_kind && (
          <p className="notice notice-error" role="note">
            지금은 확인하지 못했어요. 위 등급은 마지막으로 확인에 성공한 시각({when(d.last_checked_ok_at)}) 기준이라 지금과 다를 수 있어요.
          </p>
        )}
        {evidence.length > 0 && (
          <>
            <h3>근거</h3>
            <ul>
              {evidence.map((e) => (
                <li key={e.id}>
                  {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer">{e.id}</a> : e.id}
                  {e.severity && <span className="source">심각도 {e.severity}{e.fixed ? ` · 고친 버전 ${e.fixed}` : ""}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="muted">등급 규칙 {d.grade_rule_version ?? NONE} · 등급을 매긴 시각 {when(d.graded_at)}</p>
      </article>
      {children}
      </div>

      <aside className="td-mine" aria-label="내 목록에서의 상태">
      <article className="card" aria-labelledby="read-title">
        <h2 id="read-title">내 목록에서의 상태</h2>
        <dl className="kv">
          <dt>프로젝트</dt><dd>{d.projects?.name ?? NONE}</dd>
          <dt>출처</dt><dd>{ORIGIN_LABEL[d.origin] ?? d.origin}</dd>
          <dt>읽은 파일</dt><dd>{d.source_file ?? "없음(직접 넣은 기술)"}</dd>
          <dt>쓰는 버전</dt><dd>{d.version ?? "모름"}</dd>
          <dt>마지막으로 읽은 시각</dt><dd>{when(d.read_at)}</dd>
          <dt>마지막 확인 성공</dt><dd>{when(d.last_checked_ok_at)}</dd>
          {d.collect_error_kind && <><dt>수집 오류</dt><dd>{COLLECT_ERROR_TEXT[d.collect_error_kind] ?? d.collect_error_kind}. 오류가 난 동안에는 "문제 없음"으로 보지 마세요.</dd></>}
        </dl>
      </article>
      <p className="muted">비슷한 기술과 견주기는 <Link href="/compare">기술 비교</Link>에서 할 수 있어요.</p>
      </aside>
      </div>
    </main>
  );
}
