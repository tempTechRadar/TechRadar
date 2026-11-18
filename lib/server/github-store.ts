// GitHub 저장소 정보 수집기의 DB 읽기·쓰기(P-9b). 주인: 김영식 A. 수집기(collect-github.ts)는 순서·기록을 맡고, 저장 규칙은 여기에 둔다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterFound, afterMissing, desiredStatus, repoKey, repoRefOf, type RepoInfo, type RepoRef, type StatusState } from "../domain/github-repo.ts";

export const SOURCE_NAME = "github";
/** triedAt: 마지막으로 읽어 본 시각(성공·실패 모두). 오래 안 읽은 것부터 읽는 순서에 쓴다 */
export type Target = { id: string; key: string; ref: RepoRef; triedAt: string };
type Signals = Record<string, unknown>;
type Row = { status: string; status_by: string | null; missed_count: number; license: string | null; last_activity_at: string | null; last_activity_kind: string | null; last_checked_ok_at: string | null; signals: unknown };
type Observation = { metric: string; prev: Record<string, unknown> | null; curr: Record<string, unknown>; size: string };
type Write = { runId: string; sourceId: string; techId: string; at: string; before: Row; patch: Record<string, unknown>; obs: Observation[] };

const PAGE = 500;
const ROW_COLUMNS = "status, status_by, missed_count, license, last_activity_at, last_activity_kind, last_checked_ok_at, signals";
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const asSignals = (v: unknown): Signals => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Signals) : {});
const asText = (v: unknown) => (typeof v === "string" ? v : "");
const withoutKeys = (s: Signals, ...keys: string[]): Signals => Object.fromEntries(Object.entries(s).filter(([k]) => !keys.includes(k)));
const day = (iso: string | null) => (iso === null ? "없음" : iso.slice(0, 10));
const stateOf = (r: Row): StatusState => ({ status: r.status, statusBy: r.status_by, missed: r.missed_count });
const starsOf = (r: Row): number | null => (typeof asSignals(r.signals).stars === "number" ? (asSignals(r.signals).stars as number) : null);
const timeOf = (v: unknown): number | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null);

export async function readSource(db: SupabaseClient): Promise<{ id: string; enabled: boolean }> {
  const { data, error } = await db.from("sources").select("id, enabled").eq("name", SOURCE_NAME).single();
  if (error) throw new Error(`출처 ${SOURCE_NAME}를 읽지 못함: ${error.message}`);
  return { id: data.id as string, enabled: Boolean(data.enabled) }; // 관리자가 끈 출처는 읽지 않는다(IA-15)
}

type TechRow = { id: string; tech_key: string; repo_url: string | null; signals: unknown };

// 두꺼운 진짜 기술을 쪽으로 나눠 모두 읽는다(PostgREST는 한 번에 1000줄까지라 안 나누면 뒤쪽이 조용히 잘린다).
async function readThickRows(db: SupabaseClient): Promise<TechRow[]> {
  const rows: TechRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("technologies").select("id, tech_key, repo_url, signals").eq("depth", "thick").eq("is_simulated", false).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`기술 목록을 읽지 못함: ${error.message}`);
    rows.push(...((data ?? []) as TechRow[]));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

/** 읽을 기술: 두꺼운 기술 중 GitHub 저장소가 있는 것, 오래 안 읽어 본(안 읽은 것 먼저) 순서. 실패한 기술도 읽어 본 시각이 적혀 뒤로 간다. */
export async function readTargets(db: SupabaseClient): Promise<Target[]> {
  return (await readThickRows(db))
    .flatMap((r): Target[] => {
      const ref = repoRefOf(r);
      const s = asSignals(r.signals);
      return ref ? [{ id: r.id, key: r.tech_key, ref, triedAt: asText(s.github_tried_at) || asText(s.github_checked_at) }] : [];
    })
    .sort((a, b) => byCode(a.triedAt, b.triedAt));
}

async function readRow(db: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await db.from("technologies").select(ROW_COLUMNS).eq("id", id).single();
  if (error) throw new Error(`기술을 읽지 못함: ${error.message}`);
  return data as Row;
}

async function writeRow(db: SupabaseClient, id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("technologies").update(patch).eq("id", id);
  if (error) throw new Error(`저장소 정보를 저장하지 못함: ${error.message}`);
}

/**
 * 고친 값을 먼저 쓰고 수집 자료를 남긴다. 수집 자료를 못 남기면 고친 값을 원래대로 되돌려(null도), 다음 실행이 같은 변경을 깨끗하게 다시 한다(불변 3·4).
 * 줄은 쓰기 직전에 다시 읽어 합친다(실행 시작 때의 옛 값으로 레지스트리 수집기가 쓴 칸을 덮어쓰지 않게).
 * shortcut: 줄 고치기와 수집 자료 쓰기는 한 거래가 아니라서, 둘 사이에 프로세스가 죽으면 그 수집 자료는 안 남고 응답을 못 받은 insert가 실제로는 들어갔으면 다음에 한 번 더 남는다.
 * 읽기와 쓰기 사이의 잠금도 없다. 겹쳐 도는 실행이 생기면 DB 함수(한 거래)로 옮긴다(다운로드 수집기와 같은 지름길)
 */
async function writeWithObservations(db: SupabaseClient, w: Write): Promise<boolean> {
  await writeRow(db, w.techId, w.patch);
  if (w.obs.length === 0) return false;
  const { error } = await db.from("observations").insert(
    w.obs.map((o) => ({ source_id: w.sourceId, tech_id: w.techId, metric: o.metric, prev_value: o.prev, curr_value: o.curr, change_size: o.size, run_id: w.runId, observed_at: w.at, is_simulated: false })),
  );
  if (!error) return true;
  const original = Object.fromEntries(Object.keys(w.patch).map((k) => [k, (w.before as Record<string, unknown>)[k]]));
  const undo = await writeRow(db, w.techId, original).then(() => "", (u: Error) => ` (저장한 값을 되돌리지도 못함: ${u.message})`);
  throw new Error(`수집 자료를 저장하지 못함: ${error.message}${undo}`);
}

export type Found = { target: Target; sourceId: string; runId: string; info: RepoInfo; at: string };

const activityChange = (before: Row, nextAt: string | null): Observation[] =>
  nextAt === null || (before.last_activity_at !== null && Date.parse(before.last_activity_at) === Date.parse(nextAt))
    ? []
    : [{ metric: "activity", prev: before.last_activity_at === null ? null : { last_activity_at: before.last_activity_at }, curr: { last_activity_at: nextAt }, size: `마지막 푸시 ${day(before.last_activity_at)} → ${day(nextAt)}` }];

function starsChange(before: Row, stars: number): Observation[] {
  const prev = starsOf(before);
  if (prev === stars) return [];
  return [{ metric: "stars", prev: prev === null ? null : { stars: prev }, curr: { stars }, size: prev === null ? `처음 읽음: 별 ${stars}` : `별 ${prev} → ${stars}` }];
}

const licenseChange = (before: Row, license: string): Observation[] =>
  before.license === license ? [] : [{ metric: "license", prev: before.license === null ? null : { license: before.license }, curr: { license }, size: `라이선스 ${before.license ?? "처음 읽음"} → ${license}` }];

const statusChange = (before: Row, status: string): Observation[] =>
  before.status === status ? [] : [{ metric: "status", prev: { status: before.status }, curr: { status }, size: `${before.status} → ${status}` }];

/**
 * 마지막 활동으로 적을 시각: 읽은 마지막 푸시가 이미 적힌 것보다 **새로울** 때만(나중에 릴리스 수집이 더 새로운 시각을 적어도, 같은 시각의 릴리스 종류를 푸시로 덮지 않게).
 * 이 기술이 읽는 저장소가 바뀌었으면(repoChanged) 옛 저장소의 시각을 지키지 않고 읽은 푸시로 바꾼다. 푸시가 없는 빈 저장소는 이전 값을 그대로 둔다.
 */
function nextActivity(before: Row, info: RepoInfo, repoChanged: boolean): string | null {
  if (info.pushedAt === null) return null;
  return repoChanged || before.last_activity_at === null || Date.parse(info.pushedAt) > Date.parse(before.last_activity_at) ? info.pushedAt : null;
}

/** 찾은 저장소를 저장한다. 바뀐 값이 있으면 true. */
export async function saveFound(db: SupabaseClient, f: Found): Promise<boolean> {
  const before = await readRow(db, f.target.id);
  const sig = asSignals(before.signals);
  const key = repoKey(f.target.ref);
  const repoChanged = typeof sig.github_found_repo === "string" && sig.github_found_repo !== key;
  const activityAt = nextActivity(before, f.info, repoChanged);
  // 상태는 적힌 값과 읽은 푸시 중 더 새로운 활동으로 정한다(줄에 더 새로운 시각이 있는데 "쉬는 중"이라 적히지 않게)
  const latest = activityAt ?? before.last_activity_at;
  const plan = afterFound(stateOf(before), desiredStatus({ ...f.info, pushedAt: latest }, Date.parse(f.at)));
  const patch: Record<string, unknown> = {
    license: f.info.license, status: plan.status, status_by: plan.statusBy, missed_count: plan.missed, last_checked_ok_at: f.at,
    signals: { ...withoutKeys(sig, "github_error", "github_missed_at"), stars: f.info.stars, github_found_repo: key, github_checked_at: f.at, github_tried_at: f.at },
    ...(activityAt === null ? {} : { last_activity_at: activityAt, last_activity_kind: "commit" }),
  };
  const obs = [...activityChange(before, activityAt), ...starsChange(before, f.info.stars), ...licenseChange(before, f.info.license), ...statusChange(before, plan.status)];
  return writeWithObservations(db, { runId: f.runId, sourceId: f.sourceId, techId: f.target.id, at: f.at, before, patch, obs });
}

export type Missing = { target: Target; sourceId: string; runId: string; at: string };

/**
 * 못 찾은 저장소(404·비공개): 성공한 읽기에서 못 찾은 횟수를 올린다. 첫 못 찾음의 시각을 적어 두고(signals.github_missed_at),
 * **지금 읽는 저장소를** 한 번이라도 찾은 적(signals.github_found_repo)이 있고 12시간이 지난 두 번째 이후일 때만 사라짐으로 정한다
 * (주소를 고쳐 다른 저장소를 가리키게 된 줄이 옛 저장소를 찾은 적으로 사라짐이 되지 않게). 상태가 바뀌었으면 true.
 * 한 번도 찾은 적 없는 저장소는 정보를 읽은 적이 없으므로 "정보를 확인한 시각"(last_checked_ok_at·github_checked_at)을 올리지 않는다.
 */
export async function saveMissing(db: SupabaseClient, m: Missing): Promise<boolean> {
  const before = await readRow(db, m.target.id);
  const sig = asSignals(before.signals);
  const everFound = sig.github_found_repo === repoKey(m.target.ref);
  const firstMiss = before.missed_count === 0 ? null : timeOf(sig.github_missed_at);
  const plan = afterMissing(stateOf(before), { everFound, firstMissAt: firstMiss, nowMs: Date.parse(m.at) });
  const patch: Record<string, unknown> = {
    status: plan.status, status_by: plan.statusBy, missed_count: plan.missed, ...(everFound ? { last_checked_ok_at: m.at } : {}),
    signals: { ...withoutKeys(sig, "github_error"), github_missed_at: firstMiss === null ? m.at : sig.github_missed_at, ...(everFound ? { github_checked_at: m.at } : {}), github_tried_at: m.at },
  };
  return writeWithObservations(db, { runId: m.runId, sourceId: m.sourceId, techId: m.target.id, at: m.at, before, patch, obs: statusChange(before, plan.status) });
}

/** 읽지 못한 기술: 이전 값·상태는 그대로 두고, 읽어 본 시각과 오류 종류만 남긴다(불변 2·4). */
export async function markFailed(db: SupabaseClient, id: string, kind: string, at: string): Promise<void> {
  const row = await readRow(db, id);
  await writeRow(db, id, { signals: { ...asSignals(row.signals), github_tried_at: at, github_error: kind } });
}

/** 저장하다 멈춘 기술: 오류 표시는 안 남기고 읽어 본 시각만 적어 뒤로 보낸다(다음 실행이 같은 기술에서 또 멈춰 뒤의 기술이 굶지 않게). */
export async function markTried(db: SupabaseClient, id: string, at: string): Promise<void> {
  const row = await readRow(db, id);
  await writeRow(db, id, { signals: { ...asSignals(row.signals), github_tried_at: at } });
}
