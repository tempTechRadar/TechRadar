// 현황 소식 탭(P-12f ④ 틀 + ⑥ DataCollector readNewsFeed): 바깥 소식 · 내 새 취약점(로그인 때만) · 요즘 뜨는 기술 · 새 공식 스킬/플러그인, 최근 30일, 새것부터.
// 로그인 전에도 보인다(공개 값만). 못 읽은 출처는 이름과 함께 "읽지 못했어요"(소식 없음과 다르게, 불변 2). 바깥 소식은 제목 · 요약 · 원문 링크만(약관: 원문 링크를 꼭 함께)
import type { NewsFeedResult } from "@/lib/server/news-feed";
import type { NewsKind } from "@/lib/views/news";
import { koreanTime } from "@/lib/flow/run-list";

const KIND_KO: Record<NewsKind, string> = { external: "공식 소식", vuln: "내 기술 취약점", trending: "요즘 뜨는", official_new: "새 공식 스킬 · 플러그인" };
const TONE: Record<NewsKind, string> = { external: "neutral", vuln: "danger", trending: "neutral", official_new: "neutral" };

/** feed = null: 소식 읽기 자체가 실패(연결 없음 등), "preview" = 미리보기(개발용) 가짜 계정이라 DB를 부르지 않음 */
export function NewsTab({ feed }: { feed: NewsFeedResult | null | "preview" }) {
  if (feed === "preview") return <p className="notice notice-empty">미리보기(개발용)에서는 소식을 읽지 않아요. 실제 계정이나 로그인 전 화면에서 보여요.</p>;
  if (!feed) return <p className="notice notice-error" role="alert"><strong>소식을 불러오지 못했어요.</strong> 소식이 없다는 뜻이 아니에요. 잠시 뒤 다시 불러와 주세요.</p>;
  return (
    <section aria-labelledby="news-title">
      <h2 id="news-title">소식 <span className="muted">최근 30일</span></h2>
      <p className="muted">알림이 아니에요. 판단 대기 수에 들어가지 않아요. 원문은 출처 사이트에서 읽어요.</p>
      {feed.failed.length ? <p className="notice notice-error" role="alert">일부 소식을 읽지 못했어요: {feed.failed.join(", ")}. 그 소식이 없다는 뜻이 아니에요.</p> : null}
      {feed.items.length === 0 ? (feed.failed.length ? null : <p className="notice notice-empty">최근 30일 소식이 아직 없어요.</p>) : (
        <ul className="alert-list">{feed.items.map((n) => {
          const kind = n.kind ?? "external";
          return (
            <li key={n.id}>
              <a className="alert-row" href={n.url} target="_blank" rel="noopener noreferrer">
                <span className={`badge badge-${TONE[kind]}`}>{KIND_KO[kind]}</span>
                <span className="alert-main"><strong>{n.title}</strong>{n.summary ? <span className="muted">{n.summary}</span> : null}<span className="muted">출처: {n.source} · 원문 보기(새 창)</span></span>
                <time className="alert-time" dateTime={n.publishedAt}>{koreanTime(n.publishedAt)}</time>
              </a>
            </li>
          );
        })}</ul>
      )}
      {feed.omitted ? <p className="muted">출처 링크가 없는 소식 {feed.omitted}건은 뺐어요.</p> : null}
    </section>
  );
}
