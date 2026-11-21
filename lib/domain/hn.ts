// Hacker News 화제 신호의 순수 규칙(P-21b, ADR 0030 2번, 데이터설계 8절 관문 1). 주인: 김영식 A.
// 글은 GitHub 저장소나 npm 패키지로 이어질 때만 쓴다(근거 없는 글은 저장하지 않음). 글의 제목·주소는 믿지 않는 입력이라 여기서 거른다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { cleanText } from "./clean-text.ts";

export const HN_KEYWORDS = ["mcp", "model context protocol", "claude code", "agent skills"] as const;

/** Algolia search_by_date의 글 하나(쓰는 칸만) */
export type HnHit = { objectID: string; title: string; url: string | null; points: number; num_comments: number; created_at_i: number };
export type StoryTarget = { kind: "github"; owner: string; repo: string } | { kind: "npm"; name: string };
export type HnSignal = { points: number; comments: number; story_id: string; story_url: string; title: string; seen_at: string };

const MAX_URL = 500;
const MAX_TITLE = 200;
const NAME = /^[\w.-]+$/;
// 소유자 자리에 오지만 저장소가 아닌 GitHub 경로
const NOT_OWNER = new Set(["orgs", "topics", "features", "sponsors", "marketplace", "collections", "trending", "settings", "about", "pricing", "enterprise", "login", "search", "explore", "apps", "users", "notifications", "customer-stories", "readme", "security", "site", "events"]);
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function safeUrl(raw: unknown): URL | null {
  if (typeof raw !== "string" || raw.length > MAX_URL) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

const segments = (u: URL) => u.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));

function githubTarget(parts: string[]): StoryTarget | null {
  const [owner, rawRepo] = parts;
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo || NOT_OWNER.has(owner.toLowerCase())) return null;
  if (!NAME.test(owner) || !NAME.test(repo) || /^\.+$/.test(owner) || /^\.+$/.test(repo)) return null;
  return { kind: "github", owner, repo };
}

function npmTarget(parts: string[]): StoryTarget | null {
  if (parts[0] !== "package") return null;
  const name = (parts[1]?.startsWith("@") ? `${parts[1]}/${parts[2] ?? ""}` : parts[1] ?? "").toLowerCase();
  return NPM_NAME.test(name) ? { kind: "npm", name } : null;
}

/** 글 주소 → 저장소·패키지. 다른 곳(블로그·gist·소유자 화면)으로 가면 null. 네트워크는 부르지 않는다. */
export function parseStoryLink(url: unknown): StoryTarget | null {
  const u = safeUrl(url);
  if (!u) return null;
  let parts: string[];
  try {
    parts = segments(u);
  } catch {
    return null; // 잘못된 % 인코딩
  }
  const host = u.hostname.toLowerCase();
  if (host === "github.com" || host === "www.github.com") return githubTarget(parts);
  if (host === "npmjs.com" || host === "www.npmjs.com") return npmTarget(parts);
  return null;
}

const KEYWORD = /(?<![\p{L}\p{N}])(mcp|model\s+context\s+protocol|claude\s+code|agent\s+skills)(?![\p{L}\p{N}])/iu;
/** 제목에 키워드가 낱말로 있나. 붙어 쓴 "mcpserver"는 아니고 "MCP-server"는 맞다. */
export const matchesKeyword = (title: string): boolean => KEYWORD.test(title);

/** 모르는 저장소를 얇게 들일 종류. 저장소 이름에 mcp·skill이 있을 때만(ADR 0030 2번 "이름에 맞을 때만"), 아니면 null */
export function typeGuess(repo: string): "mcp" | "skill" | null {
  const name = repo.toLowerCase();
  if (name.includes("mcp")) return "mcp";
  if (name.includes("skill")) return "skill";
  return null;
}

/** 같은 대상을 묶는 키. 저장소는 대소문자를 같게 본다(기술 키도 이 모양) */
export const targetKey = (t: StoryTarget): string => (t.kind === "github" ? `github:${t.owner}/${t.repo}`.toLowerCase() : `npm:${t.name}`);

const better = (a: HnHit, b: HnHit) => a.points - b.points || a.num_comments - b.num_comments || a.created_at_i - b.created_at_i;

/** 같은 저장소·패키지를 가리키는 글이 여럿이면 점수가 가장 높은 글 하나만(같으면 댓글, 그다음 최근) */
export function bestPerTarget(hits: { target: StoryTarget; hit: HnHit }[]): { target: StoryTarget; hit: HnHit }[] {
  const best = new Map<string, { target: StoryTarget; hit: HnHit }>();
  for (const h of hits) {
    const cur = best.get(targetKey(h.target));
    if (!cur || better(h.hit, cur.hit) > 0) best.set(targetKey(h.target), h);
  }
  return [...best.values()];
}

const cleanTitle = (t: string) => cleanText(t, MAX_TITLE);

export function signalOf(hit: HnHit, seenAt: string): HnSignal {
  return {
    points: hit.points, comments: hit.num_comments, story_id: hit.objectID,
    story_url: `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`, title: cleanTitle(hit.title), seen_at: seenAt,
  };
}

/** 같은 글·같은 점수·댓글이면 다시 쓰지 않는다(seen_at만 다른 것은 바뀐 게 아님, 불변 3) */
export const sameSignal = (a: unknown, b: HnSignal): boolean => {
  const o = a as Partial<HnSignal> | null;
  return !!o && o.story_id === b.story_id && o.points === b.points && o.comments === b.comments && o.title === b.title;
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function hitOf(v: unknown): HnHit | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o.objectID !== "string" || !/^\d{1,12}$/.test(o.objectID) || typeof o.title !== "string") return null;
  if (!isNum(o.points) || !isNum(o.created_at_i)) return null;
  const url = typeof o.url === "string" ? o.url : null;
  return { objectID: o.objectID, title: o.title, url, points: o.points, num_comments: isNum(o.num_comments) ? o.num_comments : 0, created_at_i: o.created_at_i };
}

/** Algolia 응답 → 글 목록. 모양이 다르면(hits 배열 없음) null. 칸이 빠진 글 하나는 버리고 수만 센다 */
export function readHits(text: string): { hits: HnHit[]; invalid: number } | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  const raw = (body as { hits?: unknown } | null)?.hits;
  if (!Array.isArray(raw)) return null;
  const hits = raw.map(hitOf).filter((h): h is HnHit => h !== null);
  return { hits, invalid: raw.length - hits.length };
}
