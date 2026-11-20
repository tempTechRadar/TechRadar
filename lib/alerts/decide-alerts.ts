// 변경 1건에 대해 어떤 사람에게 알림을 새로 만들지 정한다. DB·화면을 모르는 순수 함수(SPEC-3.1).

export type ChangeToAlert = {
  id: string;
  kind: "grade_to_danger" | "first_seen_danger" | "model_eol";
  techId: string;
  dedupeKey: string;
  isSimulated: boolean;
};

export type TechUsage = {
  userId: string;
  myTechnologyId: string;
  techId: string;
  isDemo: boolean;
  hidden: boolean;
  archived: boolean;
};

export type NewAlert = {
  userId: string;
  changeId: string;
  myTechnologyId: string;
  kind: "security" | "model_eol";
  dedupeKey: string;
};

type Input = {
  change: ChangeToAlert;
  usages: TechUsage[];
  existingAlertKeys: ReadonlySet<string>;
};

export function decideAlerts({ change, usages, existingAlertKeys }: Input): NewAlert[] {
  const firstUsageByUser = new Map<string, TechUsage>();
  for (const usage of usages) {
    if (usage.techId !== change.techId) continue;
    if (usage.hidden || usage.archived) continue;
    if (change.isSimulated && !usage.isDemo) continue;
    if (!firstUsageByUser.has(usage.userId)) firstUsageByUser.set(usage.userId, usage);
  }
  return [...firstUsageByUser.values()]
    .map((usage) => ({
      userId: usage.userId,
      changeId: change.id,
      myTechnologyId: usage.myTechnologyId,
      kind: change.kind === "model_eol" ? ("model_eol" as const) : ("security" as const),
      dedupeKey: `${usage.userId}|${change.dedupeKey}`,
    }))
    .filter((alert) => !existingAlertKeys.has(alert.dedupeKey));
}
