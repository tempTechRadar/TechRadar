// 공식 MCP 레지스트리 수집의 DB 읽기·쓰기(P-9c). 주인: 김영식 A. 수집기(collect-registry.ts)는 순서·기록을 맡고, 저장 규칙은 여기에 둔다.
// 상대 경로 import·파라미터 프로퍼티 없음: `@/` 별칭이나 그 문법이 있으면 node --test가 불러오지 못한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { patchFor, rowFor, type ExistingTech, type RegistryDraft } from "../domain/registry.ts";

export type RegistrySource = { id: string; enabled: boolean; lastSyncedAt: string | null; syncStartedAt: string | null; syncCursor: string | null };
export type Applied = { created: number; updated: number; statusChanged: number; unchanged: number; skipped: number };
type Existing = ExistingTech & { id: string; tech_key: string };

const KEYS_PER_QUERY = 40; // 주소가 너무 길어지지 않게(스코프 패키지 키는 인코딩하면 길어진다)
const EXISTING_COLUMNS = "id, tech_key, depth, status, thick_reasons, one_liner, one_liner_source, repo_url, is_official";

export async function readRegistrySource(db: SupabaseClient): Promise<RegistrySource> {
  const { data, error } = await db.from("sources").select("id, enabled, last_synced_at, sync_started_at, sync_cursor").eq("name", "mcp_registry").single();
  if (error) throw new Error(`출처 mcp_registry를 읽지 못함: ${error.message}`);
  return { id: data.id as string, enabled: Boolean(data.enabled), lastSyncedAt: data.last_synced_at ?? null, syncStartedAt: data.sync_started_at ?? null, syncCursor: data.sync_cursor ?? null };
}

/** 공식 조직 목록(관리자가 고치는 rule_lists, 켜진 것만). 소문자로 돌려준다. */
export async function readOfficialOrgs(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.from("rule_lists").select("value").eq("kind", "official_org").eq("enabled", true);
  if (error) throw new Error(`공식 조직 목록을 읽지 못함: ${error.message}`);
  return (data ?? []).map((r) => String(r.value).toLowerCase());
}

async function updateSource(db: SupabaseClient, sourceId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("sources").update(patch).eq("id", sourceId);
  if (error) throw new Error(`읽은 자리를 저장하지 못함: ${error.message}`);
}

/** 전체 읽기를 한 실행에 다 못 하면 다음 실행이 여기서 이어 간다(목록이 이름순이라 시각으로는 못 적는다). */
export const saveProgress = (db: SupabaseClient, sourceId: string, p: { startedAt: string; cursor: string | null }) =>
  updateSource(db, sourceId, { sync_started_at: p.startedAt, sync_cursor: p.cursor });

/** 끝까지 읽었다: 다음에는 이 시작 시각 이후 바뀐 것만 읽는다. */
export const finishPass = (db: SupabaseClient, sourceId: string, startedAt: string) =>
  updateSource(db, sourceId, { last_synced_at: startedAt, sync_started_at: null, sync_cursor: null });

async function readExisting(db: SupabaseClient, keys: string[]): Promise<Map<string, Existing>> {
  const found = new Map<string, Existing>();
  for (let i = 0; i < keys.length; i += KEYS_PER_QUERY) {
    const { data, error } = await db.from("technologies").select(EXISTING_COLUMNS).in("tech_key", keys.slice(i, i + KEYS_PER_QUERY));
    if (error) throw new Error(`기술 목록을 읽지 못함: ${error.message}`);
    for (const row of (data ?? []) as Existing[]) found.set(row.tech_key, row);
  }
  return found;
}

/**
 * 한 쪽에서 읽은 서버를 기술 줄에 반영한다. 새 줄은 얇게 넣고(처음 보는 중단·삭제 서버는 들이지 않는다: 데이터설계 8절 관문 1 "빼는 것"),
 * 있는 줄은 바뀐 칸만 고친다(사용자 저장소가 만든 줄을 덮어쓰지 않음).
 * 상태가 바뀐 것은 수집 자료(status)로 남긴다. 같은 키를 가리키는 서버가 여럿이면 한 쪽 안에서는 쓰는 중인(active) 것을 먼저(기술 줄은 키마다 하나).
 */
export async function applyDrafts(db: SupabaseClient, at: { runId: string; sourceId: string; at: string }, drafts: RegistryDraft[]): Promise<Applied> {
  const byKey = new Map<string, RegistryDraft>();
  for (const d of drafts) {
    const kept = byKey.get(d.techKey);
    if (!kept || (kept.status !== "active" && d.status === "active")) byKey.set(d.techKey, d); // 중단된 서버가 같은 패키지를 쓰는 active 서버를 가리면 그 서버는 줄이 안 생긴다
  }
  const existing = await readExisting(db, [...byKey.keys()]);
  const unseen = [...byKey.values()].filter((d) => !existing.has(d.techKey));
  const fresh = unseen.filter((d) => d.status === "active");
  if (fresh.length > 0) {
    const up = await db.from("technologies").upsert(fresh.map(rowFor), { onConflict: "tech_key", ignoreDuplicates: true });
    if (up.error) throw new Error(`기술을 저장하지 못함: ${up.error.message}`);
  }
  const changes: { ex: Existing; patch: Record<string, unknown> }[] = [];
  for (const [key, ex] of existing) {
    const patch = patchFor(ex, byKey.get(key)!);
    if (Object.keys(patch).length > 0) changes.push({ ex, patch });
  }
  let statusChanged = 0;
  for (const c of changes) {
    const r = await db.from("technologies").update(c.patch).eq("id", c.ex.id);
    if (r.error) throw new Error(`기술을 고치지 못함: ${r.error.message}`);
    if (typeof c.patch.status === "string") {
      await insertStatusObservation(db, at, c);
      statusChanged++;
    }
  }
  const skipped = unseen.length - fresh.length;
  return { created: fresh.length, updated: changes.length, statusChanged, unchanged: byKey.size - unseen.length - changes.length, skipped };
}

/**
 * 상태를 고친 줄마다 바로 수집 자료를 남긴다. 못 남기면 상태를 원래대로 되돌려, 다음 실행이 같은 변경을 깨끗하게 다시 한다
 * (되돌리지 않으면 다음에는 "이미 바뀜"으로 보여 기록이 영영 안 남는다. 불변 3·4, downloads-store와 같은 규칙).
 */
async function insertStatusObservation(db: SupabaseClient, at: { runId: string; sourceId: string; at: string }, { ex, patch }: { ex: Existing; patch: Record<string, unknown> }): Promise<void> {
  const { error } = await db.from("observations").insert({
    source_id: at.sourceId, tech_id: ex.id, metric: "status", run_id: at.runId, observed_at: at.at,
    prev_value: { status: ex.status }, curr_value: { status: patch.status }, change_size: `${ex.status} → ${patch.status}`,
  });
  if (!error) return;
  const undo = await db.from("technologies").update({ status: ex.status }).eq("id", ex.id);
  throw new Error(`수집 자료를 저장하지 못함: ${error.message}${undo.error ? ` (상태를 되돌리지도 못함: ${undo.error.message})` : ""}`);
}
