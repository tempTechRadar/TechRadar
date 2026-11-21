// Hacker News 수집기의 DB 읽기·쓰기(P-21b). 주인: 김영식 A. 수집기(collect-hn.ts)는 순서·기록을 맡고, 저장 규칙은 여기에 둔다.
// 알려진 기술에는 signals.hn만 갱신한다(두껍게 올리지 않음, 다른 신호·사용자 값은 그대로). 바뀐 줄에만 수집 자료(불변 3·4).
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { repoKey, repoRefOf } from "../domain/github-repo.ts";
import { sameSignal, targetKey, type HnSignal, type StoryTarget } from "../domain/hn.ts";

export const SOURCE_NAME = "hn";
const PAGE = 1000;
const LINKABLE = "repo_url.not.is.null,tech_key.like.github:*,tech_key.like.npm:*"; // 저장소·패키지로 찾을 수 있는 줄만(11-21 운영 1만 5천여 줄 중 5천여 줄)
type Signals = Record<string, unknown>;
type TechRow = { id: string; tech_key: string; repo_url: string | null };
export type Catalog = Map<string, string[]>; // 대상 키(`github:<소유자>/<저장소>` 소문자, `npm:<이름>`) → 기술 id들
export type Saved = { sourceId: string; runId: string; at: string };

const asSignals = (v: unknown): Signals => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Signals) : {});

export async function readSource(db: SupabaseClient): Promise<{ id: string; enabled: boolean }> {
  const { data, error } = await db.from("sources").select("id, enabled").eq("name", SOURCE_NAME).single();
  if (error) throw new Error(`출처 ${SOURCE_NAME}를 읽지 못함: ${error.message}`);
  return { id: data.id as string, enabled: Boolean(data.enabled) }; // 관리자가 끈 출처는 읽지 않는다(IA-15)
}

const add = (m: Catalog, key: string, id: string) => m.set(key, [...(m.get(key) ?? []), id]);

/**
 * 저장소 하나에는 줄 하나만: `github:` 키 줄이 있으면 그것, 없으면 id가 가장 작은 줄(id 순으로 읽어 먼저 온 줄). 별 후보(github-search-store)와 같은 규칙.
 * shortcut: 같은 저장소를 가리키는 나머지 줄(모노레포의 패키지들)에는 HN 신호가 붙지 않는다. 패키지마다 필요해지면 묶음 쓰기로 바꾼다
 */
function pickRepoRow(m: Catalog, key: string, r: TechRow): void {
  if (!m.has(key) || r.tech_key.toLowerCase() === key) m.set(key, [r.id]);
}

/**
 * 저장소·패키지로 찾을 수 있는 진짜 기술을 쪽으로 나눠 읽어 저장소·패키지 키로 찾는 표를 만든다(PostgREST는 한 번에 1000줄까지).
 * 저장소는 `github:` 키나 repo_url(대소문자·.git·끝 / 무시)로, 패키지는 `npm:` 키로 찾는다. 가짜(is_simulated) 줄은 건드리지 않는다.
 * shortcut: 매 실행 찾을 수 있는 줄 전체(11-21 운영 5천여 줄, 1000줄씩 6번)를 읽는다. 수만 줄이 되면 글이 가리키는 대상만 DB에서 찾는다
 */
export async function readCatalog(db: SupabaseClient): Promise<Catalog> {
  const m: Catalog = new Map();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("technologies").select("id, tech_key, repo_url").eq("is_simulated", false).or(LINKABLE).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`기술 목록을 읽지 못함: ${error.message}`);
    for (const r of (data ?? []) as TechRow[]) {
      const ref = repoRefOf(r);
      if (ref) pickRepoRow(m, `github:${repoKey(ref)}`, r);
      if (r.tech_key.startsWith("npm:")) add(m, r.tech_key.toLowerCase(), r.id);
    }
    if ((data?.length ?? 0) < PAGE) return m;
  }
}

async function readSignals(db: SupabaseClient, id: string): Promise<Signals> {
  const { data, error } = await db.from("technologies").select("signals").eq("id", id).single();
  if (error) throw new Error(`신호를 읽지 못함: ${error.message}`);
  return asSignals(data.signals);
}

async function writeSignals(db: SupabaseClient, id: string, signals: Signals): Promise<void> {
  const { error } = await db.from("technologies").update({ signals }).eq("id", id);
  if (error) throw new Error(`화제 신호를 저장하지 못함: ${error.message}`);
}

type Obs = { techId: string; prev: number | null; curr: HnSignal };
async function insertObservation(db: SupabaseClient, s: Saved, { techId, prev, curr }: Obs): Promise<void> {
  const { error } = await db.from("observations").insert({
    source_id: s.sourceId, tech_id: techId, metric: "hn_points",
    prev_value: prev === null ? null : { hn_points: prev }, curr_value: { hn_points: curr.points, story_id: curr.story_id },
    change_size: prev === null ? `새 글: HN ${curr.points}점` : `HN ${prev} → ${curr.points}점`, run_id: s.runId, observed_at: s.at, is_simulated: false,
  });
  if (error) throw new Error(`수집 자료를 저장하지 못함: ${error.message}`);
}

/**
 * signals.hn을 쓴다. 바뀌었으면 true(같은 글·점수·댓글이면 쓰지 않음).
 * 신호를 먼저 쓰고 수집 자료를 남긴다. 수집 자료를 못 남기면 신호를 원래대로 되돌린다(downloads-store.ts saveReading과 같은 순서, 불변 3·4).
 * 신호는 쓰기 직전에 다시 읽어 합친다(다른 수집기가 쓴 신호를 덮어쓰지 않게).
 * signals.hn은 "최근 7일 안에서 가장 점수 높은 글"이고, 7일 밖으로 나가도 지우지 않는다: 낡았는지는 seen_at으로 판단한다(점수에 쓰기 전에 만료 정책을 정할 것).
 * shortcut: 읽기와 쓰기 사이에 잠금은 없다(downloads-store.ts와 같음). 같은 순간 겹쳐 도는 실행이 있으면 드물게 한쪽 신호를 덮는다. 겹치면 DB 함수로
 */
export async function saveSignal(db: SupabaseClient, { saved: s, techId, signal }: { saved: Saved; techId: string; signal: HnSignal }): Promise<boolean> {
  const before = await readSignals(db, techId);
  if (sameSignal(before.hn, signal)) return false;
  const prevHn = asSignals(before.hn);
  // 다른 글이면 점수를 이어 비교하지 않는다(서로 다른 글의 점수 차이를 오르내림으로 보이지 않게)
  const prev = prevHn.story_id === signal.story_id && typeof prevHn.points === "number" ? prevHn.points : null;
  await writeSignals(db, techId, { ...before, hn: signal });
  try {
    await insertObservation(db, s, { techId, prev, curr: signal });
  } catch (e) {
    const undo = await writeSignals(db, techId, before).then(() => "", (u: Error) => ` (신호를 되돌리지도 못함: ${u.message})`);
    throw new Error(`${(e as Error).message}${undo}`);
  }
  return true;
}

/**
 * 모르는 저장소를 얇게 새로 만든다(ADR 0033 2번). 설명이 없으니 출처 링크도 없다. 들어온 날이 "새로 나온 날"이 아니라 NEW에서 뺀다(registry_backfill, isBulkFilled).
 * 줄을 먼저 만들고 signals.hn은 saveSignal로 쓴다: 수집 자료를 못 남기면 hn 없는 줄만 남아 다음 실행이 알려진 기술로 다시 쓴다.
 * 이미 같은 키가 있으면(그 사이 다른 수집기가 만듦) 만들지 않고 null.
 */
export async function createThin(db: SupabaseClient, target: Extract<StoryTarget, { kind: "github" }>, type: "mcp" | "skill"): Promise<string | null> {
  const key = targetKey(target);
  const row = {
    tech_key: key, display_name: `${target.owner}/${target.repo}`, type, depth: "thin", status: "active", one_liner: null, one_liner_source: null,
    repo_url: `https://github.com/${target.owner}/${target.repo}`, is_official: false, signals: { registry_backfill: true },
  };
  const { data, error } = await db.from("technologies").upsert(row, { onConflict: "tech_key", ignoreDuplicates: true }).select("id");
  if (error) throw new Error(`새 기술을 만들지 못함(${key}): ${error.message}`);
  return ((data ?? []) as { id: string }[])[0]?.id ?? null;
}
