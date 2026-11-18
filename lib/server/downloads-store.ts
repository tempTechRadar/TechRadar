// 다운로드 수집기의 DB 읽기·쓰기(P-9). 주인: 김영식 A. 수집기(collect-downloads.ts)는 순서·기록을 맡고, 저장 규칙은 여기에 둔다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeChange, packageOf, type Ecosystem, type PackageRef } from "../domain/downloads.ts";

export const SOURCE_NAME: Record<Ecosystem, string> = { npm: "npm_downloads", pypi: "pypi_downloads" };
export type SourceIds = Partial<Record<Ecosystem, string>>; // 관리자가 끈 출처는 없음
/** triedAt: 마지막으로 읽어 본 시각(성공·실패 모두). 오래 안 읽은 것부터 읽는 순서에 쓴다 */
export type Target = { id: string; key: string; ecosystem: Ecosystem; ref: PackageRef | null; triedAt: string };
export type Reading = { target: Target; sourceId: string; weekly: number; at: string };
type Signals = Record<string, unknown>;
type TechRow = { id: string; tech_key: string; signals: unknown };

const PAGE = 500;
const byCode = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const asSignals = (v: unknown): Signals => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Signals) : {});
const asText = (v: unknown) => (typeof v === "string" ? v : "");

export async function readSourceIds(db: SupabaseClient): Promise<SourceIds> {
  const { data, error } = await db.from("sources").select("id, name, enabled").in("name", Object.values(SOURCE_NAME));
  if (error) throw new Error(`출처 목록을 읽지 못함: ${error.message}`);
  const ids: SourceIds = {};
  for (const eco of ["npm", "pypi"] as const) {
    const row = data?.find((s) => s.name === SOURCE_NAME[eco]);
    if (!row) throw new Error(`출처 ${SOURCE_NAME[eco]}를 찾지 못함`);
    if (row.enabled) ids[eco] = row.id as string; // 관리자가 끈 출처는 읽지 않는다(IA-15)
  }
  return ids;
}

// 두꺼운 진짜 기술을 쪽으로 나눠 모두 읽는다(PostgREST는 한 번에 1000줄까지라 안 나누면 뒤쪽이 조용히 잘린다).
// shortcut: 종류(npm·pypi)는 코드에서 거른다. 두꺼운 기술이 수천 개가 되면 DB에서 거른다
async function readThickRows(db: SupabaseClient): Promise<TechRow[]> {
  const rows: TechRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from("technologies").select("id, tech_key, signals").eq("depth", "thick").eq("is_simulated", false).order("id").range(from, from + PAGE - 1);
    if (error) throw new Error(`기술 목록을 읽지 못함: ${error.message}`);
    rows.push(...((data ?? []) as TechRow[]));
    if ((data?.length ?? 0) < PAGE) return rows;
  }
}

/** 읽을 기술: 두꺼운 npm·pypi 기술, 오래 안 읽어 본(안 읽은 것 먼저) 순서. 실패한 기술도 읽어 본 시각이 적혀 뒤로 간다. */
export async function readTargets(db: SupabaseClient): Promise<Target[]> {
  return (await readThickRows(db))
    .filter((r) => /^(npm|pypi):/.test(r.tech_key))
    .map((r): Target => {
      const s = asSignals(r.signals);
      return { id: r.id, key: r.tech_key, ecosystem: r.tech_key.startsWith("pypi:") ? "pypi" : "npm", ref: packageOf(r.tech_key), triedAt: asText(s.downloads_tried_at) || asText(s.downloads_checked_at) };
    })
    .sort((a, b) => byCode(a.triedAt, b.triedAt));
}

async function readSignals(db: SupabaseClient, id: string): Promise<Signals> {
  const { data, error } = await db.from("technologies").select("signals").eq("id", id).single();
  if (error) throw new Error(`신호를 읽지 못함: ${error.message}`);
  return asSignals(data.signals);
}

async function writeSignals(db: SupabaseClient, id: string, signals: Signals): Promise<void> {
  const { error } = await db.from("technologies").update({ signals }).eq("id", id);
  if (error) throw new Error(`인기 신호를 저장하지 못함: ${error.message}`);
}

async function insertObservation(db: SupabaseClient, runId: string, r: Reading, prev: number | null): Promise<void> {
  const { error } = await db.from("observations").insert({
    source_id: r.sourceId, tech_id: r.target.id, metric: "downloads",
    prev_value: prev === null ? null : { weekly_downloads: prev }, curr_value: { weekly_downloads: r.weekly },
    change_size: describeChange(prev, r.weekly), run_id: runId, observed_at: r.at, is_simulated: false,
  });
  if (error) throw new Error(`수집 자료를 저장하지 못함: ${error.message}`);
}

const withoutError = (s: Signals): Signals => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "downloads_error"));

/**
 * 읽은 값을 저장한다. 바뀌었으면 true.
 * 신호를 먼저 쓰고 수집 자료를 남긴다. 수집 자료를 못 남기면 신호를 원래대로 되돌려, 다음 실행이 같은 변경을 깨끗하게 다시 한다(불변 3·4).
 * 신호는 쓰기 직전에 다시 읽어 합친다(실행 시작 때의 옛 복사본으로 다른 수집기가 쓴 신호를 덮어쓰지 않게).
 * shortcut: 읽기와 쓰기 사이는 한 요청 안이라 짧지만 잠금은 없다. 같은 순간 겹쳐 도는 실행이 있으면 드물게 둘 다 쓴다. 겹치면 DB 함수로
 */
export async function saveReading(db: SupabaseClient, runId: string, r: Reading): Promise<boolean> {
  const before = await readSignals(db, r.target.id);
  const prev = typeof before.weekly_downloads === "number" ? before.weekly_downloads : null;
  await writeSignals(db, r.target.id, { ...withoutError(before), weekly_downloads: r.weekly, downloads_checked_at: r.at, downloads_tried_at: r.at });
  if (prev === r.weekly) return false;
  try {
    await insertObservation(db, runId, r, prev);
  } catch (e) {
    const undo = await writeSignals(db, r.target.id, before).then(() => "", (u: Error) => ` (신호를 되돌리지도 못함: ${u.message})`);
    throw new Error(`${(e as Error).message}${undo}`);
  }
  return true;
}

/** 읽지 못한 기술: 이전 값·확인 시각은 그대로 두고, 읽어 본 시각과 오류 종류만 남긴다(불변 2·4). */
export async function markFailed(db: SupabaseClient, id: string, kind: string, at: string): Promise<void> {
  await writeSignals(db, id, { ...(await readSignals(db, id)), downloads_tried_at: at, downloads_error: kind });
}
