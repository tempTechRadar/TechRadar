// RSS 2.0 · Atom 피드와 GitHub 릴리스 목록(JSON)을 소식 항목으로 읽는다(P-12f ⑥). DB · 네트워크를 모르는 순수 함수.
// 바깥에서 온 글이라 믿지 않는다: https 주소만, 태그는 지우고 글자만, 길이를 자르고, 날짜를 못 읽거나 미래인 항목은 버린다.
// 항목을 하나도 못 읽으면 "소식 없음"이 아니라 읽기 실패로 던진다(모양이 바뀌었을 수 있다, 불변 2). 새 라이브러리 없이 indexOf로 자른다(안 닫힌 태그에도 느려지지 않게).

export type NewsEntry = { title: string; url: string; publishedAt: string; summary: string | null };

export const MAX_ENTRIES = 30; // 피드 하나에서 한 번에 가져오는 가장 많은 항목(가장 새것부터는 아니고 피드 순서대로)
const MAX_TITLE = 300;
const MAX_SUMMARY = 400;
const MAX_URL = 2000;
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z]{2,5});/g, (whole, name: string) => {
    if (name[0] !== "#") return NAMED[name] ?? whole;
    const code = name[1] === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

/** 글자만: CDATA 풀기 → 글자 코드 풀기 → 태그 지우기 → 제어 글자 · 겹친 공백 정리 */
function plain(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  return decode(decode(unwrapped).replace(/<[^>]*>/g, " ")).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** `<tag …>…</tag>` 조각들(대소문자 무시). 닫는 태그가 없으면 거기서 멈춘다 */
function blocks(xml: string, tag: string): string[] {
  const lower = xml.toLowerCase();
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const out: string[] = [];
  for (let from = 0; out.length < MAX_ENTRIES * 4; ) {
    const start = lower.indexOf(open, from);
    if (start < 0) break;
    const next = lower[start + open.length];
    if (next !== ">" && next !== " " && next !== "\n" && next !== "\t" && next !== "\r" && next !== "/") { from = start + open.length; continue; } // <entryfoo> 같은 다른 태그
    const end = lower.indexOf(close, start);
    if (end < 0) break;
    out.push(xml.slice(start, end + close.length));
    from = end + close.length;
  }
  return out;
}

/** 조각 안 첫 `<tag>` 글(속성 무시). 없으면 null */
function inner(block: string, tag: string): string | null {
  const lower = block.toLowerCase();
  const open = lower.indexOf(`<${tag}`);
  if (open < 0) return null;
  const gt = lower.indexOf(">", open);
  const end = lower.indexOf(`</${tag}>`, gt);
  return gt < 0 || end < 0 ? null : block.slice(gt + 1, end);
}

/** Atom `<link href="…" rel="alternate">` — rel이 없거나 alternate인 것만 */
function atomLink(block: string): string | null {
  for (const m of block.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /\brel\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (href && (!rel || rel === "alternate")) return decode(href);
  }
  return null;
}

function httpsUrl(raw: string | null): string | null {
  const text = raw ? plain(raw) : "";
  if (!text || text.length > MAX_URL) return null;
  try {
    const u = new URL(text);
    const href = u.toString(); // 퍼센트 인코딩으로 길어질 수 있어 정리한 뒤의 길이를 다시 본다(DB 제약 url ≤ 2000과 같게)
    return u.protocol === "https:" && !u.username && !u.password && href.length <= MAX_URL ? href : null;
  } catch {
    return null;
  }
}

function dateOf(raw: string | null, nowMs: number): string | null {
  const t = raw ? Date.parse(plain(raw)) : NaN;
  return Number.isFinite(t) && t <= nowMs + FUTURE_SLACK_MS ? new Date(t).toISOString() : null;
}

function entryOf(block: string, atom: boolean, nowMs: number): NewsEntry | null {
  const title = cut(plain(inner(block, "title") ?? ""), MAX_TITLE);
  const url = httpsUrl(atom ? atomLink(block) : inner(block, "link") ?? inner(block, "guid"));
  const publishedAt = dateOf(atom ? inner(block, "published") ?? inner(block, "updated") : inner(block, "pubdate") ?? inner(block, "dc:date"), nowMs);
  if (!title || !url || !publishedAt) return null;
  const rawSummary = atom ? inner(block, "summary") ?? inner(block, "content") : inner(block, "description") ?? inner(block, "content:encoded");
  const summary = rawSummary ? cut(plain(rawSummary), MAX_SUMMARY) : "";
  return { title, url, publishedAt, summary: summary || null };
}

/** RSS 2.0 또는 Atom 글을 읽는다. 읽은 항목이 없으면(모양이 다르거나 비었거나 전부 이상함) 던진다 */
export function parseFeed(xml: string, nowMs: number): NewsEntry[] {
  const head = xml.slice(0, 4000).toLowerCase();
  const atom = head.includes("<feed");
  if (!atom && !head.includes("<rss") && !head.includes("<rdf:rdf") && !head.includes("<channel")) throw new Error("RSS · Atom 모양이 아니에요");
  const all = blocks(xml, atom ? "entry" : "item");
  const entries = all.flatMap((b) => entryOf(b, atom, nowMs) ?? []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) throw new Error(`항목을 하나도 읽지 못했어요(찾은 조각 ${all.length}개, 피드 모양이 바뀌었을 수 있어요)`);
  return entries;
}

/** GitHub 릴리스 목록(JSON 글). 초안은 버리고, 이름이 없으면 태그 이름을 제목으로 쓴다 */
export function parseReleases(json: string, nowMs: number): NewsEntry[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("GitHub 릴리스 응답을 해석하지 못했어요");
  }
  if (!Array.isArray(data)) throw new Error("GitHub 릴리스 응답이 목록이 아니에요");
  const entries = data.slice(0, MAX_ENTRIES).flatMap((r): NewsEntry[] => {
    const v = (r ?? {}) as { name?: unknown; tag_name?: unknown; html_url?: unknown; published_at?: unknown; body?: unknown; draft?: unknown };
    if (v.draft === true) return [];
    const str = (x: unknown) => (typeof x === "string" ? x : null);
    const title = cut(plain(str(v.name) || str(v.tag_name) || ""), MAX_TITLE);
    const url = httpsUrl(str(v.html_url));
    const publishedAt = dateOf(str(v.published_at), nowMs);
    if (!title || !url || !publishedAt) return [];
    const body = cut(plain((str(v.body) ?? "").replace(/[#*`>_~]+/g, " ")), MAX_SUMMARY);
    return [{ title, url, publishedAt, summary: body || null }];
  });
  if (data.length > 0 && entries.length === 0) throw new Error("릴리스를 하나도 읽지 못했어요(응답 모양이 바뀌었을 수 있어요)");
  return entries;
}
