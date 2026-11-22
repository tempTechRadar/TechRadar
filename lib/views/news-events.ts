// 소식판에 섞이는 "이미 모은 사건" 항목 만들기(P-12f ⑥ a). DB · 화면을 모르는 순수 함수: 읽어 온 줄을 NewsItem으로 바꾼다.
// 모든 항목은 https 출처 링크와 이름이 있어야 한다("출처 없는 소식"을 만들지 않음). 소식으로 만들 수 없어 뺀 것(링크 · 이름 · 날짜가 없음)은 omitted로 센다(조용히 사라지지 않게).
// 만들지 않은 것: "내 기술의 새 버전"(레지스트리 수집기가 버전 변화를 기록하지 않음 — 지금 운영 observations에 version 지표가 없다), "모델 지원 종료"(model_eol 사건은 3순위라 아직 안 생김).
import type { Trending } from "../domain/trending.ts";
import type { NewsItem } from "./news.ts";

const https = (v: unknown): string | null => (typeof v === "string" && v.startsWith("https://") ? v : null);
const record = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
type Built = { items: NewsItem[]; omitted: number };
const built = (items: (NewsItem | null)[]): Built => ({ items: items.flatMap((i) => i ?? []), omitted: items.filter((i) => i === null).length });

/** 바깥 소식 수집기가 모은 줄(news_items) → 항목. labels: source_key → 사람이 읽는 이름 */
export type NewsRowIn = { id: string; source_key: string; title: string; url: string; summary: string | null; published_at: string; tools: string[] | null; official: boolean };
export const externalNews = (rows: NewsRowIn[], labels: Record<string, string>): NewsItem[] =>
  rows.map((r) => ({ id: `news:${r.id}`, title: r.title, url: r.url, publishedAt: r.published_at, source: labels[r.source_key] ?? r.source_key, official: r.official === true, tools: r.tools ?? [], kind: "external", summary: r.summary }));

/** 내 기술의 새 취약점(changes: grade_to_danger · first_seen_danger). 본인 알림에 이어진 줄만 읽히므로(RLS) 내 것뿐이다. 출처는 OSV 근거 주소 */
export type VulnChangeIn = { id: string; kind: string; detected_at: string; curr_value: unknown; technologies: { display_name?: unknown } | { display_name?: unknown }[] | null };
const VULN_KINDS = ["grade_to_danger", "first_seen_danger"];
export function vulnNews(rows: VulnChangeIn[]): Built {
  return built(rows.filter((r) => VULN_KINDS.includes(r.kind)).map((r) => {
    const tech = Array.isArray(r.technologies) ? r.technologies[0] : r.technologies;
    const name = text(tech?.display_name, 100);
    const curr = record(r.curr_value);
    const evidence = Array.isArray(curr?.evidence) ? (curr!.evidence as unknown[]) : [];
    const url = evidence.map((e) => https(record(e)?.url)).find((u) => u !== null) ?? null;
    if (!name || !url) return null;
    const first = text(record(evidence[0])?.id, 60);
    return { id: `vuln:${r.id}`, title: `${name}에서 새 취약점이 알려졌어요${first ? ` (${first})` : ""}`, url, publishedAt: r.detected_at, source: "OSV 취약점 DB", official: true, tools: [name], kind: "vuln", summary: text(curr?.reason, 300) };
  }));
}

/** 요즘 뜨는 기술(lib/domain/trending.ts). 출처는 HN 글 주소, 없으면 저장소 주소. 시각은 신호가 읽힌 때(Trending.at) — 지금 시각을 날짜처럼 쓰지 않고, 날짜를 모르면 뺀다 */
export function trendingNews(list: Trending[]): Built {
  return built(list.map((t) => {
    const hn = t.reasons.find((r) => r.kind === "hn");
    const url = (hn?.kind === "hn" ? https(hn.url) : null) ?? t.link;
    if (!url || !t.at) return null;
    const stars = t.reasons.find((r) => r.kind === "stars");
    const bits = [stars?.kind === "stars" ? `이번 주 별 +${stars.gain}` : null, hn?.kind === "hn" ? `Hacker News ${hn.points}점` : null].filter(Boolean);
    return { id: `trending:${t.id}`, title: `${t.name} — 요즘 뜨고 있어요`, url, publishedAt: t.at, source: hn ? "Hacker News · GitHub" : "GitHub", official: false, tools: [t.name], kind: "trending", summary: bits.join(" · ") };
  }));
}

/** 새 공식 스킬 · 플러그인(공개 목록, 대량 채우기 · 입문 세트 제외는 읽는 쪽 조건). 출처는 저장소 주소, 시각은 들어온 때 */
export type OfficialNewIn = { id: string; display_name: string; type: string; repo_url: string | null; created_at: string };
export function officialNews(rows: OfficialNewIn[]): Built {
  return built(rows.map((r) => {
    const url = https(r.repo_url);
    if (!url || !r.display_name) return null;
    const kind = r.type === "plugin" ? "플러그인" : "스킬";
    return { id: `official:${r.id}`, title: `${r.display_name} — 새 공식 ${kind}이 카탈로그에 들어왔어요`, url, publishedAt: r.created_at, source: "공식 카탈로그", official: true, tools: [r.display_name], kind: "official_new", summary: null };
  }));
}
