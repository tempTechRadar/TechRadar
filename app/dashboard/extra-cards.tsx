import Link from "next/link";
import type { ReviewDue } from "@/lib/alerts/find-review-due";

// 대시보드의 이번 주 요약(PRD-F43)과 보류 회고(PRD-F41) 카드. 와이어프레임 docs/wireframes/extras.html#dashboard.

export function WeekCard({ count }: { count: number }) {
  return (
    <article className="card" aria-labelledby="week-title">
      <h2 id="week-title">이번 주 요약</h2>
      {count === 0 ? (
        <div className="notice notice-empty"><strong>이번 주에는 내 기술에 변화가 없어요.</strong></div>
      ) : (
        <p>이번 주(최근 7일) 내 기술 변화 <strong>{count}건</strong></p>
      )}
      <p><Link href="/alerts?period=7d">알림에서 보기</Link></p>
    </article>
  );
}

// 보류한 지 30일이 지난 판단이 없으면 카드 자체를 그리지 않는다. 보류는 고칠 수 없어서(SPEC-4.1) 링크는 상세만 연다.
export function ReviewCard({ items }: { items: ReviewDue[] }) {
  if (items.length === 0) return null;
  return (
    <article className="card" aria-labelledby="review-title">
      <h2 id="review-title">다시 볼까요?</h2>
      <p className="muted">보류한 지 30일이 지난 판단이에요. 이 건수는 &quot;판단 대기&quot;에 들어가지 않아요.</p>
      <ul className="alert-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link className="alert-row" href={`/alerts/${item.id}`}>
              <span className="badge badge-neutral">보류</span>
              <span className="alert-main"><strong>{item.techName}</strong><span className="muted">이유: {item.reason}</span></span>
              <span className="badge badge-neutral">{item.daysAgo}일 전</span>
              <time className="alert-time" dateTime={item.judgedAt}>{item.judgedOn} 보류</time>
            </Link>
          </li>
        ))}
      </ul>
      <p className="muted">보류한 판단은 고칠 수 없어요. 같은 기술에 새 알림이 오면 그때 다시 판단해요.</p>
    </article>
  );
}
