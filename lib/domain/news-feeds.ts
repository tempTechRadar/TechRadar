// 바깥 소식 수집기(P-12f ⑥)가 읽는 공식 피드 목록. DB · 화면을 모르는 순수 값.
// **약관을 확인한 것만** 넣는다(docs/data-sources.md "소식 피드 후보와 약관", DocsChecker 2026-11-21). 조건: 하루 1번 · 요청 사이 1초 · 제목 / 링크 / 날짜 / 짧은 요약만 · 원문 링크를 같이 보임 · AI 학습에 쓰지 않음.
// 안 쓰는 것: github.com/…/releases.atom(robots Disallow), openai.com/news/rss.xml · cursor.com/changelog/rss.xml(약관이 자동 수집을 금지), Anthropic 뉴스 RSS(주소를 확인하지 못함).
// 피드를 더하려면 먼저 약관을 확인해 docs/data-sources.md에 적고 여기에 한 줄 더한다(최대 MAX_FEEDS개).

export type NewsFeed =
  /** undated: 항목에 날짜 칸이 없는 피드(2026-11 Google 개발자 블로그가 날짜 없는 RSS로 바뀜). 읽은 때를 날짜로 쓴다 — 하루 한 번 읽어 하루 안쪽으로 맞는다 */
  | { key: string; label: string; kind: "feed"; url: string; tools: string[]; undated?: true }
  /** GitHub REST `GET /repos/{owner}/{repo}/releases`(API 수집은 scraping이 아니다, GitHub AUP §7) */
  | { key: string; label: string; kind: "github_releases"; repo: string; tools: string[] };

export const MAX_FEEDS = 10;

export const NEWS_FEEDS: NewsFeed[] = [
  { key: "github_changelog", label: "GitHub 변경 기록", kind: "feed", url: "https://github.blog/changelog/feed/", tools: ["github", "copilot"] },
  { key: "google_ai", label: "Google AI 소식", kind: "feed", url: "https://blog.google/technology/ai/rss/", tools: ["gemini"] },
  { key: "google_developers", label: "Google 개발자 블로그", kind: "feed", url: "https://developers.googleblog.com/feeds/posts/default", tools: ["gemini"], undated: true },
  { key: "claude_code_releases", label: "Claude Code 새 버전", kind: "github_releases", repo: "anthropics/claude-code", tools: ["claude-code", "claude"] },
];

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** 릴리스 목록 주소. 저장소 이름이 이상하면 null(주소에 끼워 넣지 않는다) */
export function releasesUrl(repo: string): string | null {
  const [owner, name] = repo.split("/");
  if (!REPO.test(repo) || [owner, name].some((p) => p === "." || p === "..")) return null;
  return `https://api.github.com/repos/${owner}/${name}/releases?per_page=10`;
}
