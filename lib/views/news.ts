// 소식판(PRD-F37, IA-21): 최근 30일, 내가 쓰는 곳으로 거르기. 알림이 아니다. 순수 함수.
// 두 가지가 섞인다(P-12f ⑥): 바깥 소식(공식 피드만, official이 참일 때)과 우리가 이미 모은 사건(취약점 · 요즘 뜨는 기술 · 새 공식 스킬/플러그인: 우리가 계산한 것이라 official 표시 없이도 출처 링크가 https면 통과).

/** external = 바깥 소식 수집기(news_items), 나머지는 이미 모은 사건에서 만든 항목 */
export type NewsKind = "external" | "vuln" | "trending" | "official_new";
export type NewsItem = { id: string; title: string; url: string; publishedAt: string; source: string; official: boolean; tools: string[]; kind?: NewsKind; summary?: string | null };

export const NEWS_DAYS = 30;
const DAY_MS = 86_400_000;

/** https 출처 링크가 있는 것만(바깥 소식은 공식 출처만), 최근 30일, 고른 도구가 있으면 그 도구 소식만, 새것부터 */
export function newsBoard(items: NewsItem[], nowMs: number, tools: string[] = []): NewsItem[] {
  const since = nowMs - NEWS_DAYS * DAY_MS;
  const want = new Set(tools.map((t) => t.toLowerCase()));
  return items
    .filter((n) => n.url.startsWith("https://") && (n.official || (n.kind ?? "external") !== "external"))
    .filter((n) => {
      const t = Date.parse(n.publishedAt);
      return Number.isFinite(t) && t >= since && t <= nowMs;
    })
    .filter((n) => want.size === 0 || n.tools.some((t) => want.has(t.toLowerCase())))
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : a.id < b.id ? -1 : 1));
}
