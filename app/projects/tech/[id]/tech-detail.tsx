import Link from "next/link";
import { COLLECT_ERROR_TEXT, evidenceLinks, GRADE_LABEL, GRADE_TONE, ORIGIN_LABEL } from "@/lib/domain/my-tech-view";
import { koreanTime } from "@/lib/flow/run-list";
import type { MyTechDetail } from "@/lib/server/my-tech";
import { usingNowText, type UsingNowView } from "@/lib/views/using-now-text";

// 기술 상세 본문(IA-4, PRD-F10). 읽기만 하는 화면 조각이라 page.tsx와 개발용 샘플 화면이 같이 쓴다.
// 아직 없는 것: 같은 역할의 기술(P-14·P-18 확정 뒤), 이 기술에 대한 내 판단 기록, 3순위 칸(사용기·비교 모드). 쓰고 있어요는 using_now 함수로(P-12a2).
const NONE = "확인하지 못함";
const when = (iso: string | null) => (iso ? koreanTime(iso) : NONE);

// using: 공개한 사람의 수·별명(null = 못 읽음, undefined = 카탈로그에 이어지지 않은 기술이라 해당 없음)
export function TechDetail({ d, using }: { d: MyTechDetail; using?: UsingNowView | null }) {
  const info = d.technologies;
  const name = info?.display_name ?? d.manual_name ?? "(이름 없음)";
  const evidence = evidenceLinks(d.grade_evidence);
  return (
    <main className="alerts">
      <p className="muted"><Link href="/projects">← 내 프로젝트로</Link></p>
      <h1>{name}</h1>
      <p>
        <span className={`badge badge-${GRADE_TONE[d.grade]}`}>{GRADE_LABEL[d.grade]}</span>{" "}
        {d.collect_error_kind && <span className="badge badge-warning">수집 오류</span>}{" "}
        {d.hidden_at && <span className="badge badge-neutral">직접 숨김</span>}
      </p>

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

      <article className="card" aria-labelledby="info-title">
        <h2 id="info-title">기술 정보</h2>
        {info ? (
          <dl className="kv">
            <dt>종류</dt><dd>{info.type}</dd>
            <dt>상태</dt><dd>{info.status}</dd>
            <dt>한 줄 설명</dt><dd>{info.one_liner ?? NONE}</dd>
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
      </article>
      {using !== undefined ? <p>{usingNowText(using)}</p> : null}
      <p className="muted">사용기 · 비교 모드는 사용자가 모이면 열려요.</p>
    </main>
  );
}
