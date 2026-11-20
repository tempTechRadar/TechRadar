import type { SupabaseClient } from "@supabase/supabase-js";
import type { TechRef } from "../domain/tech-key.ts";
import { changeKey } from "../domain/dedupe-key.ts";
import type { LatestChange } from "../domain/osv-daily.ts";

export type NewChange = {
  kind: "grade_to_danger" | "first_seen_danger" | "same_role_new" | "model_eol";
  techId: string;
  tech: TechRef;
  causeId: string;
  dangerRound?: number;
  prevValue?: unknown;
  currValue?: unknown;
  observationId?: string;
  isSimulated?: boolean;
};

/**
 * 변경 저장(공용, 불변 3). 주인: 김영식(A). P-3(OSV)과 P-5(시뮬레이터)가 같이 쓴다.
 * 같은 키가 이미 있으면 새로 만들지 않고 그 변경을 돌려준다(created=false). 알림은 그다음 단계에서 사람마다 따로 막는다.
 */
export async function saveChange(db: SupabaseClient, c: NewChange): Promise<{ id: string; created: boolean }> {
  const dedupe_key = changeKey(c.tech, c.causeId, c.dangerRound);
  const row = {
    kind: c.kind,
    tech_id: c.techId,
    version: c.tech.version,
    cause_id: c.causeId,
    danger_round: c.dangerRound ?? 1,
    prev_value: c.prevValue ?? null,
    curr_value: c.currValue ?? null,
    observation_id: c.observationId ?? null,
    dedupe_key,
    is_simulated: c.isSimulated ?? false,
  };
  const inserted = await db.from("changes").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id");
  if (inserted.error) throw new Error(`변경을 저장하지 못함: ${inserted.error.message}`);
  if (inserted.data.length > 0) return { id: inserted.data[0].id, created: true };
  const existing = await db.from("changes").select("id").eq("dedupe_key", dedupe_key).single();
  if (existing.error) throw new Error(`이미 있는 변경을 찾지 못함: ${existing.error.message}`);
  return { id: existing.data.id, created: false };
}

/**
 * 같은 (기술, 버전)에서 이 원인들(취약점 id와 별칭) 중 하나로 만든 변경 중 가장 큰 회차. 없으면 null.
 * 첫 읽기와 정기 OSV 재확인이 같이 쓴다: 위험이 이어지는 중이면 같은 변경에 알림을 잇는다(회차를 늘 1로 두지 않음).
 */
export async function readLatestChange(db: SupabaseClient, at: { techId: string; version: string | null }, causeIds: string[]): Promise<LatestChange | null> {
  if (causeIds.length === 0) return null;
  const base = db.from("changes").select("id, danger_round, created_at").eq("tech_id", at.techId).in("cause_id", causeIds);
  const { data, error } = await (at.version === null ? base.is("version", null) : base.eq("version", at.version))
    .order("danger_round", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(`이전 변경을 읽지 못함: ${error.message}`);
  return data ? { id: data.id as string, round: data.danger_round as number, createdAt: data.created_at as string } : null;
}
