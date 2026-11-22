// 현황 개요의 조각(P-12f ④): 내 레포 현황 · 적용한 기술 · 판단 대기 · 추천 카드. 숫자 4칸과 이번 주 · 회고 카드는 page.tsx · extra-cards.tsx.
// 셋 다 못 읽으면 "없음"이 아니라 "읽지 못함"(불변 2). 적용한 기술을 누르면 지도에서 그 기술(이름만 넣은 기술은 내 기술 상세).
import Link from "next/link";
import { toAlertView, type AlertRecord } from "@/lib/alerts/to-alert-view";
import type { AppliedTech, RepoCard } from "@/lib/dashboard/status-view";
import { GRADE_KO, NO_GRADE } from "@/lib/map/build-map";
import { koreanTime } from "@/lib/flow/run-list";
import { countNew, isNew } from "@/lib/dashboard/since-last-visit";

const TECH_LIMIT = 24; // 넘으면 "내 프로젝트에서 모두 보기"
const PENDING_LIMIT = 5; // 넘으면 "일지에서 모두 보기"(개요가 목록으로 길게 밀리지 않게)
const TONE = { danger: "danger", caution: "warning", unknown: "neutral", pass: "success" } as const;

export function Repos({ repos }: { repos: RepoCard[] | null }) {
  return (
    <section aria-labelledby="repos-title">
      <h2 id="repos-title">내 레포 현황</h2>
      {repos === null ? <p className="notice notice-error" role="alert"><strong>내 프로젝트를 불러오지 못했어요.</strong> 없다는 뜻이 아니에요. <Link href="/dashboard">다시 불러오기</Link></p>
        : repos.length === 0 ? <p className="notice notice-empty"><strong>아직 등록한 프로젝트가 없어요.</strong> <Link href="/projects">내 프로젝트</Link>에서 저장소를 등록하면 여기에 모여요.</p>
        : <ul className="status-repos">{repos.map((r) => (
          <li key={r.id}>
            <Link href="/projects"><b>{r.name}</b></Link>
            <p>기술 {r.techCount}개{r.errorCount ? ` · 수집 오류 ${r.errorCount}개` : ""}</p>
            <p className="muted">마지막 읽기 {r.lastReadAt ? koreanTime(r.lastReadAt) : "기록 없음"}</p>
            {r.notice ? <p className="muted">{r.notice} <Link href="/projects">내 프로젝트에서 다시 읽기</Link></p> : null}
          </li>
        ))}</ul>}
    </section>
  );
}

export function Applied({ techs, failed }: { techs: AppliedTech[]; failed: boolean }) {
  if (failed) return null; // 프로젝트를 못 읽었으면 Repos가 이미 말한다
  const tagsFailed = techs.some((t) => t.tags === null);
  return (
    <section aria-labelledby="applied-title">
      <h2 id="applied-title">적용한 기술 <span className="muted">{techs.length}</span></h2>
      {tagsFailed ? <p className="notice notice-error" role="alert">내 태그를 불러오지 못했어요. 태그가 없다는 뜻이 아니에요.</p> : null}
      {techs.length === 0 ? <p className="muted">저장소에서 읽은 기술이 아직 없어요.</p> : (
        <ul className="status-techs">{techs.slice(0, TECH_LIMIT).map((t) => (
          <li key={t.key}>
            <Link href={t.techId ? `/?sel=${encodeURIComponent(`tech:${t.techId}`)}` : `/projects/tech/${t.myTechId}`}>{t.name}</Link>
            {t.concept ? <span className="badge badge-neutral">{NO_GRADE}</span> : <span className={`badge badge-${TONE[t.grade]}`}>보안 {GRADE_KO[t.grade]}</span>}
            <p className="muted">{t.projects.join(" · ")}{t.collectError ? " · 수집 오류(지난 값)" : ""}</p>
            {t.tags?.length ? <p className="alert-tags">{t.tags.map((x) => <span key={x} className="tag">{x}</span>)}</p> : null}
          </li>
        ))}</ul>
      )}
      {techs.length > TECH_LIMIT ? <p className="status-more"><Link href="/projects">내 프로젝트에서 {techs.length}개 모두 보기</Link></p> : null}
    </section>
  );
}

/** seen = 지난번에 판단 대기를 본 시각(P-12g B5). 그보다 늦게 온 줄에 "새로 옴"(글자 + 왼쪽 띠), 제목에 수(보이는 5줄 밖도 셈) */
export function Pending({ alerts, seen }: { alerts: AlertRecord[]; seen: number | null }) {
  const pending = alerts.filter((a) => a.status === "pending").sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(toAlertView);
  const fresh = countNew(alerts, seen);
  return (
    <section aria-labelledby="pending-title">
      <h2 id="pending-title">판단 대기 <span className="muted">{pending.length}{fresh ? ` · 새로 옴 ${fresh}` : ""}</span></h2>
      {pending.length === 0 ? <p className="muted">판단을 기다리는 알림이 없어요.</p> : (
        <ul className="alert-list">{pending.slice(0, PENDING_LIMIT).map((a) => { const fresh = isNew(a.createdAt, seen); return (
          <li key={a.id}>
            <Link className="alert-row" href={`/alerts/${a.id}`} data-new={fresh ? "" : undefined}>
              <span className={`badge badge-${a.kindTone}`}>{a.kindLabel}</span>
              <span className="alert-main"><strong>{fresh ? <span className="tag status-new">새로 옴</span> : null}{a.title}</strong><span className="muted">{a.subtitle}</span>{a.tags.length ? <span className="alert-tags">{a.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span> : null}</span>
              <span className={`badge badge-${a.statusTone}`}>{a.statusLabel}</span>
              <time className="alert-time" dateTime={a.createdAt}>{a.createdAtLabel}</time>
            </Link>
          </li>
        ); })}</ul>
      )}
      {pending.length > PENDING_LIMIT ? <p className="status-more"><Link href="/history">일지에서 {pending.length}건 모두 보기</Link></p> : null}
    </section>
  );
}

export function RecommendCard() {
  return (
    <article className="card" aria-labelledby="rec-title">
      <h2 id="rec-title">추천</h2>
      <p>고른 관심 분야에서 주간 다운로드가 많은 기술이에요(이미 쓰는 기술은 빼요). 알림이 아니고 판단 대기 수에 들어가지 않아요.</p>
      <p><Link href="/recommend">추천 보기</Link></p>
    </article>
  );
}
