// 소식판(PRD-F37, IA-21): 공식 출처의 일반 소식만, 최근 30일, 내가 쓰는 곳으로 거르기. 알림이 아니다. 순수 함수.
// 소식을 모으는 수집기(P-9)가 아직 없어 화면은 자리만 둔다. 이 함수는 자료가 생기면 그대로 쓴다.

export type NewsItem = { id: string; title: string; url: string; publishedAt: string; source: string; official: boolean; tools: string[] };

export const NEWS_DAYS = 30;
const DAY_MS = 86_400_000;

/** 공식 출처·https 주소만, 최근 30일, 고른 도구가 있으면 그 도구 소식만, 새것부터 */
export function newsBoard(items: NewsItem[], nowMs: number, tools: string[] = []): NewsItem[] {
  const since = nowMs - NEWS_DAYS * DAY_MS;
  const want = new Set(tools.map((t) => t.toLowerCase()));
  return items
    .filter((n) => n.official && n.url.startsWith("https://"))
    .filter((n) => {
      const t = Date.parse(n.publishedAt);
      return Number.isFinite(t) && t >= since && t <= nowMs;
    })
    .filter((n) => want.size === 0 || n.tools.some((t) => want.has(t.toLowerCase())))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : a.id < b.id ? -1 : 1));
}
