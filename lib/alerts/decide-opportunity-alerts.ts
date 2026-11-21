// 적용 기회 알림을 누구에게 새로 만들지 정한다(SPEC-3.2, 3.5). DB·화면을 모르는 순수 함수.
// 조건은 넷(SPEC-3.2): 4는 새 기술의 별 수 하한이다(ADR 0030 · ADR 0014 개정). 갈래 안 점수 조건은 P-21 본 계산 뒤에 다시 본다. 알림 키: 사용자|내 기술 키|새 기술 키.

/** 새 기술의 별 수가 알려져 있을 때 이 수 미만이면 알림을 만들지 않는다(팀 추정, 첫 수집 뒤 분포를 보고 고친다) */
export const ALERT_MIN_STARS = 100;

export type OpportunityRelation = { otherTechId: string; status: "confirmed" | "candidate"; confirmedAt: string | null };

export type OpportunityUsage = {
  userId: string;
  myTechnologyId: string;
  techId: string;
  techKey: string;
  isDemo: boolean;
  hidden: boolean;
  archived: boolean;
  /** 내가 이 기술을 등록한 시각(my_technologies.created_at) */
  registeredAt: string;
};

export type NewOpportunityAlert = {
  userId: string;
  changeId: string;
  myTechnologyId: string;
  myTechId: string;
  kind: "opportunity";
  dedupeKey: string;
};

type Input = {
  change: { id: string; isSimulated: boolean };
  newTech: { id: string; techKey: string; grade: string; /** technologies.status: 지원 종료·사라진 기술을 "새 기술"로 추천하지 않는다 */ status: string; createdAt: string;
    /** signals.stars. 모르면 null: 못 읽은 것을 낮다고 단정하지 않는다(불변 2) */ stars: number | null;
    /** signals.candidate_flags가 비어 있지 않음: 의심 표시가 붙은 별 후보는 알림 대상이 아니다(데이터설계 8절) */ flagged: boolean };
  /** 새 기술이 맺은 같은 역할 관계들 */
  relations: OpportunityRelation[];
  usages: OpportunityUsage[];
  existingAlertKeys: ReadonlySet<string>;
};

export function decideOpportunityAlerts({ change, newTech, relations, usages, existingAlertKeys }: Input): NewOpportunityAlert[] {
  if (newTech.grade === "danger" || newTech.status === "deprecated" || newTech.status === "gone") return [];
  // 조건 4. 시뮬레이터 변경에는 안 건다: 가짜 기술은 별 정보가 없다(ADR 0014가 이 조건을 미룬 이유)
  if (!change.isSimulated && ((newTech.stars !== null && newTech.stars < ALERT_MIN_STARS) || newTech.flagged)) return [];
  const confirmedAt = new Map(relations.filter((r) => r.status === "confirmed" && r.confirmedAt).map((r) => [r.otherTechId, r.confirmedAt!]));
  const alreadyUseNewTech = new Set(usages.filter((u) => u.techId === newTech.id).map((u) => u.userId));
  const isAfter = (iso: string, than: string) => new Date(iso).getTime() > new Date(than).getTime();
  const seen = new Set<string>();
  const alerts: NewOpportunityAlert[] = [];
  for (const usage of usages) {
    if (!confirmedAt.has(usage.techId) || usage.hidden || usage.archived) continue;
    if (alreadyUseNewTech.has(usage.userId)) continue; // 새 기술을 이미 쓰는 사람에게 "나왔어요"는 의미가 없다(가정)
    // SPEC-3.2 조건 2: 내가 등록한 뒤에 들어온 기술이거나, 내가 등록한 뒤에 같은 역할로 확정됐을 때
    if (!isAfter(newTech.createdAt, usage.registeredAt) && !isAfter(confirmedAt.get(usage.techId)!, usage.registeredAt)) continue;
    if (change.isSimulated && !usage.isDemo) continue;
    const dedupeKey = `${usage.userId}|${usage.techKey}|${newTech.techKey}`;
    if (seen.has(dedupeKey) || existingAlertKeys.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    alerts.push({ userId: usage.userId, changeId: change.id, myTechnologyId: usage.myTechnologyId, myTechId: usage.techId, kind: "opportunity", dedupeKey });
  }
  return alerts;
}
