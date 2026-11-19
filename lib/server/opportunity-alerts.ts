// 적용 기회 알림 만들기(SPEC-3.2, 5.3). 주인: 황재웅(B). 규칙은 decideOpportunityAlerts, 비교표는 buildComparison이 정한다.
// 새 기술의 확정된 같은 역할 관계를 따라 "내 기술"을 쓰는 사람을 찾는다. 비교표는 만들 때 값으로 alerts.comparison에 저장한다.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildComparison } from "../alerts/build-comparison.ts";
import { decideOpportunityAlerts, type OpportunityRelation } from "../alerts/decide-opportunity-alerts.ts";
import { failure, readChange, readExistingAlertKeys, readUsages, rowsOrThrow, writeAlerts, type Row } from "./alert-db.ts";
import { toComparable } from "./comparable.ts";

type Input = { changeId: string; techId: string; onlyDemo?: boolean };
type Result = { created: number; people: number };

const COMPARABLE_COLUMNS =
  "id, tech_key, display_name, created_at, grade, grade_reason, grade_evidence, one_liner, one_liner_source, last_activity_at, last_activity_kind, repo_url, license, signals";

// 짝은 작은 id가 a라서 새 기술이 어느 쪽에 있어도 상대편을 가져온다.
async function readRelations(db: SupabaseClient, techId: string): Promise<OpportunityRelation[]> {
  const [asA, asB] = await Promise.all(
    (["tech_a", "tech_b"] as const).map((column) => db.from("tech_relations").select("tech_a, tech_b, status, confirmed_at").eq(column, techId)),
  );
  const toRelation = (otherTechId: string, row: Row): OpportunityRelation => ({ otherTechId, status: row.status, confirmedAt: row.confirmed_at });
  return [
    ...rowsOrThrow(asA, "같은 역할을 읽지 못함").map((row) => toRelation(row.tech_b, row)),
    ...rowsOrThrow(asB, "같은 역할을 읽지 못함").map((row) => toRelation(row.tech_a, row)),
  ];
}

export async function createOpportunityAlerts(db: SupabaseClient, input: Input): Promise<Result> {
  const change = await readChange(db, input.changeId);
  if (change.kind !== "same_role_new") {
    throw new Error(`적용 기회 알림은 same_role_new 변경에만 만든다 (받은 변경 종류: ${change.kind})`);
  }
  const relations = await readRelations(db, input.techId);
  const relatedIds = relations.map((r) => r.otherTechId);
  const techRows = rowsOrThrow(await db.from("technologies").select(COMPARABLE_COLUMNS).in("id", [input.techId, ...relatedIds]), "기술 정보를 읽지 못함");
  const techs = new Map(techRows.map((row) => [row.id as string, row]));
  const newTech = techs.get(input.techId);
  if (!newTech) throw failure("새 기술을 찾지 못함", input.techId);

  const usages = (await readUsages(db, [input.techId, ...relatedIds])).map((usage) => ({ ...usage, techKey: techs.get(usage.techId)?.tech_key ?? "" }));
  const alerts = decideOpportunityAlerts({
    change: { id: input.changeId, isSimulated: change.is_simulated || input.onlyDemo === true },
    newTech: { id: input.techId, techKey: newTech.tech_key, grade: newTech.grade, createdAt: newTech.created_at },
    relations,
    usages,
    existingAlertKeys: await readExistingAlertKeys(db, input.changeId),
  });
  const people = new Set(usages.filter((u) => relatedIds.includes(u.techId)).map((u) => u.userId)).size;
  if (alerts.length === 0) return { created: 0, people };
  const confirmedAt = new Map(relations.map((r) => [r.otherTechId, r.confirmedAt]));
  // 알림 상세가 "나오게 된 이유"와 표 머리를 그리도록, 표 5줄과 함께 두 기술 이름·같은 역할로 확정한 시각도 만들 때 값으로 저장한다
  const rows = alerts.map((alert) => {
    const mine = techs.get(alert.myTechId)!;
    return {
      user_id: alert.userId, change_id: input.changeId, my_technology_id: alert.myTechnologyId, kind: alert.kind, dedupe_key: alert.dedupeKey,
      comparison: {
        myTechName: mine.display_name,
        newTechName: newTech.display_name,
        confirmedAt: confirmedAt.get(alert.myTechId) ?? null,
        rows: buildComparison(toComparable(mine), toComparable(newTech)),
      },
    };
  });
  return { created: await writeAlerts(db, rows), people };
}
