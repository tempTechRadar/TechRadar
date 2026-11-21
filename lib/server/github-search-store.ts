// 별 후보 수집기의 DB 읽기·쓰기(P-21a, ADR 0030, 데이터설계 8절 "별 후보" 5~7). 주인: 김영식 A. 수집기(collect-github-search.ts)는 순서·기록을 맡고, 저장 규칙은 여기에 둔다.
// 같은 저장소(repo_url·github: 키)를 가진 줄이 있으면 새 줄 대신 그 줄을 두껍게·신호만 갱신한다(같은 기술이 여러 줄이 되지 않게). 사용자·레지스트리가 쓴 값은 덮어쓰지 않는다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import { isDeepStrictEqual } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { repoKey, repoRefOf } from "../domain/github-repo.ts";
import { REGISTRY_BASE } from "../domain/registry.ts";
import { oneLinerOf, typeOf, type Candidate, type Flag } from "../domain/star-candidates.ts";

export const SOURCE_NAME = "github_search";
export const STARS_REASON = "stars";
export const STARS_CAP = 150; // 별 이유로 두꺼워진 줄 누적 상한(ADR 0030, 팀 추정). 나가는 완충은 첫 수집 뒤
export type Existing = {
  id: string; tech_key: string; repo_url: string | null; depth: string; thick_reasons: string[] | null; one_liner: string | null; one_liner_source: string | null; signals: unknown; is_simulated: boolean;
};
/**
 * 저장할 후보 하나. top: 상위에 들어 두껍게 올릴 것. suspect: 의심 붙은 NEW 후보(얇게, score는 null).
 * refresh: 상위·의심 밖의 나머지. 전에 우리가 표시한 줄만 점수·의심 표시를 지금 값으로 맞춘다(지난 new_spike가 영영 남아 알림을 막지 않게)
 */
export type Entry = { c: Candidate; key: string; score: number | null; flags: Flag[]; mode: "top" | "suspect" | "refresh" };
export type SaveCtx = { db: SupabaseClient; runId: string; sourceId: string; at: string; existing: Map<string, Existing>; starRows: number };
/** same: 쓸 내용이 지금 줄과 같아 쓰지 않음 */
export type Saved = { outcome: "created" | "merged" | "refreshed" | "capped" | "same"; observed: boolean };
type Write = { row: Existing; patch: Patch; stars: number | null };
type Patch = Record<string, unknown>;
type Signals = Record<string, unknown>;

const PAGE = 1000;
const COLUMNS = "id, tech_key, repo_url, depth, thick_reasons, one_liner, one_liner_source, signals, is_simulated";
const asSignals = (v: unknown): Signals => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Signals) : {});

export async function readSource(db: SupabaseClient): Promise<{ id: string; enabled: boolean }> {
  const { data, error } = await db.from("sources").select("id, enabled").eq("name", SOURCE_NAME).single();
  if (error) throw new Error(`출처 ${SOURCE_NAME}를 읽지 못함: ${error.message}`);
  return { id: data.id as string, enabled: Boolean(data.enabled) }; // 관리자가 끈 출처는 읽지 않는다(IA-15)
}

/** 저장소가 있는 진짜 기술 줄을 저장소 키로 모은다(쪽으로 나눠 모두: PostgREST는 한 번에 1000줄까지). 시뮬레이터 줄은 건드리지 않는다. */
export async function readExisting(db: SupabaseClient): Promise<Map<string, Existing>> {
  const map = new Map<string, Existing>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("technologies").select(COLUMNS).or("repo_url.not.is.null,tech_key.like.github:*").order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`기술 목록을 읽지 못함: ${error.message}`);
    for (const row of (data ?? []) as Existing[]) addRow(map, row);
    if ((data?.length ?? 0) < PAGE) return map;
  }
}

// shortcut: 같은 저장소를 가리키는 줄이 여럿이면(모노레포의 패키지들) github: 키 줄, 없으면 먼저 읽은 줄 하나에만 별 신호를 붙인다. 패키지마다 붙여야 하면 묶음으로 바꾼다
function addRow(map: Map<string, Existing>, row: Existing): void {
  const ref = row.is_simulated ? null : repoRefOf(row);
  if (!ref) return;
  const key = repoKey(ref);
  if (!map.has(key) || row.tech_key.toLowerCase() === `github:${key}`) map.set(key, row);
}

/** 공식 레지스트리가 만든 줄인가: 레지스트리는 github: 키를 만들지 않고, 설명 출처가 레지스트리이거나 대량 채우기 표시(signals.registry_backfill)를 남긴다 */
export const fromRegistry = (row: Existing | undefined): boolean =>
  row !== undefined && !row.tech_key.startsWith("github:") && (typeof asSignals(row.signals).registry_backfill === "boolean" || String(row.one_liner_source ?? "").startsWith(REGISTRY_BASE));

export const countStarRows = (existing: Map<string, Existing>): number => [...existing.values()].filter((r) => (r.thick_reasons ?? []).includes(STARS_REASON)).length;

/** 후보 하나를 저장한다. 같은 저장소 줄이 있으면 합치고, 없으면 새 줄. 누적 상한에 닿으면 새로 두껍게 올리지 않는다 */
export async function saveEntry(s: SaveCtx, e: Entry): Promise<Saved> {
  const row = s.existing.get(repoKey(e.c));
  if (e.mode === "refresh") return row && "candidate_flags" in asSignals(row.signals) ? refresh(s, e, row) : SAME;
  return row ? mergeInto(s, e, row) : insertNew(s, e);
}

const SAME: Saved = { outcome: "same", observed: false };
/** 저장소 정보 수집기(fetch_github)가 이미 읽은 줄: 별 수는 그쪽(저장소 API)이 주인이다. 검색 색인 값으로 덮으면 두 값이 번갈아 써져 수집 자료가 매번 쌓인다(불변 3) */
const githubOwnsStars = (row: Existing) => "github_checked_at" in asSignals(row.signals);
const unchanged = (row: Existing, patch: Patch) => Object.entries(patch).every(([k, v]) => isDeepStrictEqual(v, (row as Record<string, unknown>)[k]));

/** 비어 있는 저장소 주소·설명만 채운다. 이 수집기가 쓴 설명(출처 링크가 같음)만 바뀐 값으로 새로 고친다(레지스트리 fillPatch와 같은 규칙) */
function fillPatch(row: Existing, c: Candidate): Patch {
  const patch: Patch = {};
  const oneLiner = oneLinerOf(c.description);
  const mine = row.one_liner_source === c.htmlUrl;
  if (oneLiner !== null && (row.one_liner === null || (mine && row.one_liner !== oneLiner))) Object.assign(patch, { one_liner: oneLiner, one_liner_source: c.htmlUrl });
  if (row.repo_url === null) patch.repo_url = c.htmlUrl;
  return patch;
}

async function mergeInto(s: SaveCtx, e: Entry, row: Existing): Promise<Saved> {
  const reasons = row.thick_reasons ?? [];
  const raise = e.mode === "top" && !reasons.includes(STARS_REASON);
  const capped = raise && s.starRows >= STARS_CAP;
  const stars = githubOwnsStars(row) ? null : e.c.stars;
  const signals = { ...asSignals(row.signals), ...(stars === null ? {} : { stars }), candidate_score: e.score, candidate_flags: e.flags };
  const patch: Patch = { signals, ...fillPatch(row, e.c) };
  if (raise && !capped) Object.assign(patch, { depth: "thick", thick_reasons: [...reasons, STARS_REASON] }); // 두께는 올리기만(내리지 않음)
  if (unchanged(row, patch)) return capped ? { outcome: "capped", observed: false } : SAME;
  const observed = await writeAndObserve(s, { row, patch, stars });
  if (raise && !capped) s.starRows++;
  return { outcome: capped ? "capped" : "merged", observed };
}

/** 나머지: 점수·의심 표시만 지금 값으로. 두께·설명·별 수는 건드리지 않는다 */
async function refresh(s: SaveCtx, e: Entry, row: Existing): Promise<Saved> {
  const patch: Patch = { signals: { ...asSignals(row.signals), candidate_score: e.score, candidate_flags: e.flags } };
  if (unchanged(row, patch)) return SAME;
  await writeAndObserve(s, { row, patch, stars: null });
  return { outcome: "refreshed", observed: false };
}

async function insertNew(s: SaveCtx, e: Entry): Promise<Saved> {
  const thick = e.mode === "top";
  if (thick && s.starRows >= STARS_CAP) return { outcome: "capped", observed: false };
  const oneLiner = oneLinerOf(e.c.description);
  const { data, error } = await s.db.from("technologies").insert({
    tech_key: e.key, display_name: e.c.fullName, type: typeOf(e.c.tags), depth: thick ? "thick" : "thin", thick_reasons: thick ? [STARS_REASON] : null,
    one_liner: oneLiner, one_liner_source: oneLiner ? e.c.htmlUrl : null, repo_url: e.c.htmlUrl,
    // 별 1,000이 넘는 저장소는 오래전에 나온 것이라 들어온 날을 "새로 나온 날"로 보지 않는다(NEW 폭주 방지, isBulkFilled). 의심 붙은 것만 NEW 후보로 보인다
    signals: { registry_backfill: e.flags.length === 0 },
  }).select(COLUMNS).single();
  if (error) throw new Error(`별 후보 기술을 저장하지 못함: ${error.message}`);
  const row = data as Existing;
  const observed = await writeAndObserve(s, { row, patch: { signals: { ...asSignals(row.signals), stars: e.c.stars, candidate_score: e.score, candidate_flags: e.flags } }, stars: e.c.stars });
  if (thick) s.starRows++;
  s.existing.set(repoKey(e.c), row);
  return { outcome: "created", observed };
}

const starsOf = (signals: unknown): number | null => (typeof asSignals(signals).stars === "number" ? (asSignals(signals).stars as number) : null);

async function writeRow(db: SupabaseClient, id: string, patch: Patch): Promise<void> {
  const { error } = await db.from("technologies").update(patch).eq("id", id);
  if (error) throw new Error(`별 후보 신호를 저장하지 못함: ${error.message}`);
}

/**
 * 고칠 칸을 먼저 쓰고, 별 수가 바뀌었으면 수집 자료(지표 stars)를 남긴다(stars가 null이면 별을 쓰지 않는 줄이라 남기지 않음). 수집 자료를 못 남기면 고친 칸을 원래대로 되돌려
 * 다음 실행이 같은 변경을 깨끗하게 다시 한다(불변 3·4, downloads-store와 같은 순서). 새 줄은 별 신호가 빠진 채로 남아 다음 실행이 다시 남긴다.
 * 쓴 뒤에는 읽어 둔 줄도 맞춰 둔다(같은 실행 안에서 다시 볼 때 "바뀌지 않음"을 바르게 판단하게).
 */
async function writeAndObserve(s: SaveCtx, { row, patch, stars }: Write): Promise<boolean> {
  const prev = starsOf(row.signals);
  await writeRow(s.db, row.id, patch);
  if (stars === null || prev === stars) {
    Object.assign(row, patch);
    return false;
  }
  const { error } = await s.db.from("observations").insert({
    source_id: s.sourceId, tech_id: row.id, metric: "stars", prev_value: prev === null ? null : { stars: prev }, curr_value: { stars },
    change_size: prev === null ? `처음 읽음: 별 ${stars}` : `별 ${prev} → ${stars}`, run_id: s.runId, observed_at: s.at, is_simulated: false,
  });
  if (!error) {
    Object.assign(row, patch);
    return true;
  }
  const original = Object.fromEntries(Object.keys(patch).map((k) => [k, (row as Record<string, unknown>)[k]]));
  const undo = await writeRow(s.db, row.id, original).then(() => "", (u: Error) => ` (저장한 값을 되돌리지도 못함: ${u.message})`);
  throw new Error(`수집 자료를 저장하지 못함: ${error.message}${undo}`);
}
