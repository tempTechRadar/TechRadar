// "요즘 뜨는 기술"(P-12f ⑦) 고르기. 지도의 "요즘 뜨는" 칩과 현황 소식이 함께 쓴다. DB · 화면을 모르는 순수 함수.
// 재료는 #203이 모으는 신호 둘: 최근 7일 별이 늘어난 수(observations의 stars 변화)와 Hacker News 글 점수(signals.hn). 숫자(30 · 30 · 상한 500)는 팀 추정이라 첫 사용 뒤 고친다(ADR 0033).
// 뜬다고 알리지 않는 것: 의심 표시(새 저장소 급등 · 복제본 묶음)가 붙은 줄(ADR 0033: NEW 후보로만), 위험 등급 기술(위험한 것을 "요즘 뜬다"고 권하지 않음), 신호를 못 읽은 줄(모르는 것을 0으로 보지 않음, 불변 2).
import type { Grade } from "./grade.ts";

export const TREND_DAYS = 7;
export const MIN_STAR_GAIN = 30; // 7일에 이만큼은 늘어야 "급등"
export const MIN_HN_POINTS = 30; // 글 점수가 이 이상이어야 "화제"
export const TREND_CAP = 500; // 한 신호가 점수를 독차지하지 않게 자르는 상한
export const DEFAULT_TREND_LIMIT = 12;
const DAY_MS = 86_400_000;
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

export type HnSeen = { points: number; comments: number; title: string; url: string; seenAt: string };
export type TrendInput = { id: string; name: string; grade: Grade; stars: number | null; starsGain: number; starsAt?: string | null; hn: HnSeen | null; flagged: boolean; link?: string | null };
export type TrendReason = { kind: "stars"; gain: number; stars: number | null } | { kind: "hn"; points: number; comments: number; title: string; url: string };
/** link = 저장소 주소(https만, 출처 링크로 씀). at = 뜬다고 본 신호가 읽힌 가장 늦은 시각(소식 날짜로 씀, 읽은 때가 아니라 신호 날짜) */
export type Trending = { id: string; name: string; score: number; reasons: TrendReason[]; link: string | null; at: string | null };

/** 별 수 관찰 하나: prev가 없으면 "처음 읽음"이라 늘었다고 보지 않는다 */
export type StarObservation = { observedAt: string; prev: number | null; curr: number };

/** 최근 7일 안에서 별이 실제로 늘어난 관찰 중 가장 늦은 시각(없으면 null). 소식 날짜로 쓴다 */
export function latestGainAt(observations: StarObservation[], nowMs: number): string | null {
  const since = nowMs - TREND_DAYS * DAY_MS;
  const times = observations.flatMap((o) => {
    const at = Date.parse(o.observedAt);
    return Number.isFinite(at) && at >= since && at <= nowMs + FUTURE_SLACK_MS && o.prev !== null && o.curr > o.prev ? [at] : [];
  });
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

/** 최근 7일 안에서 별이 늘어난 수의 합(줄어든 것은 0으로, 처음 읽은 줄은 뺀다). 시각을 못 읽거나 미래이면 뺀다 */
export function starGainOf(observations: StarObservation[], nowMs: number): number {
  const since = nowMs - TREND_DAYS * DAY_MS;
  return observations.reduce((sum, o) => {
    const at = Date.parse(o.observedAt);
    const ok = Number.isFinite(at) && at >= since && at <= nowMs + FUTURE_SLACK_MS && o.prev !== null && Number.isFinite(o.prev) && Number.isFinite(o.curr);
    return ok ? sum + Math.max(0, o.curr - o.prev!) : sum;
  }, 0);
}

const fresh = (hn: HnSeen | null, nowMs: number): hn is HnSeen => {
  if (!hn || !hn.url.startsWith("https://") || !Number.isFinite(hn.points)) return false;
  const at = Date.parse(hn.seenAt);
  return Number.isFinite(at) && at >= nowMs - TREND_DAYS * DAY_MS && at <= nowMs + FUTURE_SLACK_MS && hn.points >= MIN_HN_POINTS;
};

const part = (n: number) => Math.min(Math.max(n, 0), TREND_CAP) / 5; // 0~100

/** 뜨는 기술: 점수(별 급등 0~100 + HN 0~100) 높은 순. 같으면 이름 · id 순(늘 같은 순서). 의심 표시 · 위험 등급 · 신호가 모자란 줄은 뺀다 */
export function trendingTechs(items: TrendInput[], nowMs: number, limit = DEFAULT_TREND_LIMIT): Trending[] {
  const out: Trending[] = [];
  for (const t of items) {
    if (t.flagged || t.grade === "danger") continue;
    const reasons: TrendReason[] = [];
    if (t.starsGain >= MIN_STAR_GAIN) reasons.push({ kind: "stars", gain: t.starsGain, stars: t.stars });
    if (fresh(t.hn, nowMs)) reasons.push({ kind: "hn", points: t.hn.points, comments: t.hn.comments, title: t.hn.title, url: t.hn.url });
    if (reasons.length === 0) continue;
    const score = Math.round((part(t.starsGain >= MIN_STAR_GAIN ? t.starsGain : 0) + part(reasons.some((r) => r.kind === "hn") ? t.hn!.points : 0)) * 10) / 10;
    const times = [reasons.some((r) => r.kind === "stars") ? t.starsAt : null, reasons.some((r) => r.kind === "hn") ? t.hn?.seenAt : null].flatMap((x) => (x && Number.isFinite(Date.parse(x)) ? [Date.parse(x)] : []));
    out.push({ id: t.id, name: t.name, score, reasons, link: t.link?.startsWith("https://") ? t.link : null, at: times.length ? new Date(Math.max(...times)).toISOString() : null });
  }
  const byName = (a: Trending, b: Trending) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1);
  return out.sort((a, b) => b.score - a.score || byName(a, b)).slice(0, Math.max(0, limit));
}
