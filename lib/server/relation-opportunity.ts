// 같은 역할 확정 → 적용 기회 알림(SPEC-3.2 조건 2 "등록한 뒤에 같은 역할로 확정됐을 때", PRD-F12). 주인: 황재웅(B).
// 짝은 대칭이라 양쪽 기술 각각을 "새 기술"로 보고 변경(same_role_new)을 저장한 뒤 알림을 요청한다. 누구에게 보낼지는 decideOpportunityAlerts가 정한다.
// 확정은 이미 저장된 뒤에 부르므로 던지지 않는다: 실패는 이유를 돌려주고, 부른 쪽이 로그와 안내로 남긴다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { maskSecrets } from "../domain/redact.ts";
import type { CreateAlertsInput } from "./alerts.ts";
import type { NewChange } from "./changes.ts";

export type RelationNotifyDeps = {
  db: SupabaseClient;
  saveChange: (db: SupabaseClient, change: NewChange) => Promise<{ id: string; created: boolean }>;
  createAlertsForChange: (db: SupabaseClient, input: CreateAlertsInput) => Promise<number>;
};
export type RelationNotifyResult = { created: number; failed: string[] };

type Tech = { id: string; key: string };

const reasonOf = (error: unknown) => maskSecrets(error instanceof Error ? error.message : String(error));

async function readConfirmedPair(db: SupabaseClient, relationId: string): Promise<[Tech, Tech]> {
  const rel = await db.from("tech_relations").select("tech_a, tech_b, status").eq("id", relationId).maybeSingle();
  if (rel.error) throw new Error(`같은 역할 줄을 읽지 못함: ${rel.error.message}`);
  if (!rel.data) throw new Error("같은 역할 줄을 찾지 못함");
  if (rel.data.status !== "confirmed") throw new Error("확정된 같은 역할이 아니라 알림을 만들지 않음");
  const techs = await db.from("technologies").select("id, tech_key").in("id", [rel.data.tech_a, rel.data.tech_b]);
  if (techs.error) throw new Error(`기술 이름을 읽지 못함: ${techs.error.message}`);
  const key = (id: string) => (techs.data ?? []).find((t: { id: string; tech_key: string }) => t.id === id)?.tech_key;
  const [a, b] = [rel.data.tech_a as string, rel.data.tech_b as string];
  if (!key(a) || !key(b)) throw new Error("기술 이름을 찾지 못함");
  return [{ id: a, key: key(a)! }, { id: b, key: key(b)! }];
}

/** `newTech`를 "나온 기술", `other`를 "그와 같은 역할로 확정된 기술"로 보고 변경 저장 → 알림 요청. 만든 알림 수를 돌려준다 */
async function notifyOneSide(deps: RelationNotifyDeps, newTech: Tech, other: Tech): Promise<number> {
  const change = await deps.saveChange(deps.db, {
    kind: "same_role_new",
    techId: newTech.id,
    tech: { key: newTech.key, version: null },
    causeId: `same_role:${other.key}`,
    currValue: { sameRoleAs: other.key },
  });
  return deps.createAlertsForChange(deps.db, { changeId: change.id, techId: newTech.id, kind: "opportunity" });
}

export async function notifyRelationConfirmed(deps: RelationNotifyDeps, relationId: string): Promise<RelationNotifyResult> {
  let pair: [Tech, Tech];
  try {
    pair = await readConfirmedPair(deps.db, relationId);
  } catch (error) {
    return { created: 0, failed: [reasonOf(error)] };
  }
  const result: RelationNotifyResult = { created: 0, failed: [] };
  for (const [newTech, other] of [pair, [pair[1], pair[0]] as [Tech, Tech]]) {
    try {
      result.created += await notifyOneSide(deps, newTech, other);
    } catch (error) {
      result.failed.push(`${newTech.key}: ${reasonOf(error)}`);
    }
  }
  return result;
}
