// "요즘 뜨는 기술" 읽기(P-12f ⑦): 최근 7일 별 증가(observations의 stars 변화)와 Hacker News 글(signals.hn)로 고른다(규칙은 lib/domain/trending.ts).
// observations는 본인 알림에 이어진 것만 읽히는 표(RLS)라 서비스 키 연결(db)로 읽고, 공개 목록 규칙(listedTechs: 사라진 기술 · 남의 비공개 저장소에서 생긴 줄 · 시뮬레이터 제외)을 여기서 다시 건다(불변 5).
// 읽기에 실패하면 던진다: 빈 목록("뜨는 게 없음")으로 속이지 않는다(불변 2). 상대 경로 import: node --test가 `@/` 별칭을 못 읽는다.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Grade } from "../domain/grade.ts";
import { isFlaggedSignals, starsOfSignals } from "../domain/star-signals.ts";
import { DEFAULT_TREND_LIMIT, MIN_STAR_GAIN, TREND_DAYS, starGainOf, trendingTechs, type HnSeen, type StarObservation, type TrendInput, type Trending } from "../domain/trending.ts";
import { rowsOrThrow, type Row } from "./alert-db.ts";
import { chunks, listedTechs } from "./map-queries.ts";

const COLUMNS = "id, display_name, grade, signals, repo_url";
const GRADES: Grade[] = ["pass", "caution", "danger", "unknown"];
// shortcut: 지난 7일 별 변화 줄을 5,000개까지만 읽는다(11-21 운영은 두꺼운 줄 수백 개 × 하루 한 번이라 훨씬 적다). 넘치면 이 상한을 올리거나 쪽으로 나눠 읽는다
const OBSERVATION_LIMIT = 5000;
const DAY_MS = 86_400_000;

const record = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

const starOf = (v: unknown): number | null => {
  const n = record(v)?.stars;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** signals.hn(#203 hn-store가 쓰는 모양)을 읽는다. 모양이 다르면 null(신호 없음으로 본다) */
function hnOf(signals: unknown): HnSeen | null {
  const h = record(record(signals)?.hn);
  if (!h || typeof h.points !== "number" || typeof h.story_url !== "string" || typeof h.seen_at !== "string") return null;
  return { points: h.points, comments: typeof h.comments === "number" ? h.comments : 0, title: typeof h.title === "string" ? h.title : "", url: h.story_url, seenAt: h.seen_at };
}

/** 줄 하나 → 고르기 입력. 이름이 없는 줄은 건너뛴다 */
function toInput(r: Row, gains: Map<string, number>): TrendInput | null {
  if (typeof r.display_name !== "string" || !r.display_name) return null;
  return {
    id: r.id, name: r.display_name, grade: GRADES.find((g) => g === r.grade) ?? "unknown",
    stars: starsOfSignals(r.signals), starsGain: gains.get(r.id) ?? 0, hn: hnOf(r.signals), flagged: isFlaggedSignals(r.signals),
    link: typeof r.repo_url === "string" ? r.repo_url : null,
  };
}

async function readGains(db: SupabaseClient, sinceIso: string, nowMs: number): Promise<Map<string, number>> {
  const rows = rowsOrThrow(
    await db.from("observations").select("tech_id, prev_value, curr_value, observed_at").eq("metric", "stars").eq("is_simulated", false).gte("observed_at", sinceIso).order("observed_at", { ascending: false }).limit(OBSERVATION_LIMIT),
    "별 변화를 읽지 못함",
  );
  const byTech = new Map<string, StarObservation[]>();
  for (const r of rows) {
    const curr = starOf(r.curr_value);
    if (curr === null) continue;
    byTech.set(r.tech_id, [...(byTech.get(r.tech_id) ?? []), { observedAt: r.observed_at, prev: starOf(r.prev_value), curr }]);
  }
  return new Map([...byTech].map(([id, list]) => [id, starGainOf(list, nowMs)]));
}

export async function readTrending(db: SupabaseClient, nowMs: number = Date.now(), limit: number = DEFAULT_TREND_LIMIT): Promise<Trending[]> {
  const sinceIso = new Date(nowMs - TREND_DAYS * DAY_MS).toISOString();
  const gains = await readGains(db, sinceIso, nowMs);
  const risers = [...gains].filter(([, g]) => g >= MIN_STAR_GAIN).map(([id]) => id);
  const byStars = (await Promise.all(chunks(risers).map(async (ids) => rowsOrThrow(await listedTechs(db, COLUMNS).in("id", ids), "별이 는 기술을 읽지 못함")))).flat();
  const byHn = rowsOrThrow(await listedTechs(db, COLUMNS).gte("signals->hn->>seen_at", sinceIso).limit(1000), "화제가 된 기술을 읽지 못함");
  const rows = new Map([...byStars, ...byHn].map((r) => [r.id as string, r as Row]));
  return trendingTechs([...rows.values()].flatMap((r) => toInput(r, gains) ?? []), nowMs, limit);
}
