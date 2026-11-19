import { test } from "node:test";
import assert from "node:assert/strict";
import { decideOpportunityAlerts, type OpportunityUsage } from "./decide-opportunity-alerts.ts";

const newTech = { id: "new", techKey: "mcp-new", grade: "pass", status: "active", createdAt: "2026-11-18T00:00:00Z" };
const relations = [{ otherTechId: "mine", status: "confirmed" as const, confirmedAt: "2026-11-18T01:00:00Z" }];

function usage(userId: string, overrides: Partial<OpportunityUsage> = {}): OpportunityUsage {
  return {
    userId, myTechnologyId: `mt-${userId}`, techId: "mine", techKey: "mcp-mine",
    isDemo: false, hidden: false, archived: false, registeredAt: "2026-11-01T00:00:00Z", ...overrides,
  };
}

const run = (input: Partial<Parameters<typeof decideOpportunityAlerts>[0]> = {}) =>
  decideOpportunityAlerts({
    change: { id: "change-1", isSimulated: false },
    newTech,
    relations,
    usages: [usage("a"), usage("b")],
    existingAlertKeys: new Set(),
    ...input,
  });

test("확정된 같은 역할의 기술을 쓰는 사람마다 적용 기회 알림 1건(키는 사람|내 기술 키|새 기술 키)", () => {
  assert.deepEqual(run(), [
    { userId: "a", changeId: "change-1", myTechnologyId: "mt-a", myTechId: "mine", kind: "opportunity", dedupeKey: "a|mcp-mine|mcp-new" },
    { userId: "b", changeId: "change-1", myTechnologyId: "mt-b", myTechId: "mine", kind: "opportunity", dedupeKey: "b|mcp-mine|mcp-new" },
  ]);
});

test("새 기술의 등급이 위험이면 만들지 않고, 위험이 아니면(모름 포함) 만든다", () => {
  assert.deepEqual(run({ newTech: { ...newTech, grade: "danger" } }), []);
  assert.equal(run({ newTech: { ...newTech, grade: "unknown" } }).length, 2);
});

test("확정되지 않은(후보) 관계나 다른 기술과의 관계로는 만들지 않는다", () => {
  assert.deepEqual(run({ relations: [{ otherTechId: "mine", status: "candidate", confirmedAt: null }] }), []);
  assert.deepEqual(run({ relations: [{ otherTechId: "elsewhere", status: "confirmed", confirmedAt: "2026-11-18T01:00:00Z" }] }), []);
});

test("내가 등록한 시각 이후에 들어온 기술이거나 그 이후에 확정된 관계일 때만(둘 다 등록보다 이르면 안 만든다)", () => {
  const late = usage("late", { registeredAt: "2026-11-18T03:00:00Z" }); // 새 기술 등록(00:00)·확정(01:00)보다 늦게 등록
  const afterNewTech = usage("after-new-tech", { registeredAt: "2026-11-17T00:00:00Z" }); // 새 기술 등록보다 이르게 등록
  const confirmedLater = usage("confirmed-later", { registeredAt: "2026-11-18T00:30:00Z" }); // 새 기술은 먼저, 확정은 나중

  const found = run({ usages: [late, afterNewTech, confirmedLater] });

  assert.deepEqual(found.map((a) => a.userId), ["after-new-tech", "confirmed-later"]);
});

test("이미 새 기술도 쓰는 사람, 숨기거나 보관한 기술을 쓰는 사람에게는 만들지 않는다", () => {
  const alsoUsesNew = [usage("a"), usage("a", { myTechnologyId: "mt-a-new", techId: "new", techKey: "mcp-new" })];
  const found = run({ usages: [...alsoUsesNew, usage("b", { hidden: true }), usage("c", { archived: true }), usage("d")] });

  assert.deepEqual(found.map((a) => a.userId), ["d"]);
});

test("시뮬레이터 변경은 시연 계정에만 만든다", () => {
  const found = run({ change: { id: "change-1", isSimulated: true }, usages: [usage("real"), usage("demo", { isDemo: true })] });

  assert.deepEqual(found.map((a) => a.userId), ["demo"]);
});

test("같은 사람이 같은 기술을 여러 프로젝트에 써도 알림 1건, 이미 있는 알림은 빼서 다시 돌려도 새로 안 만들고, 나중에 등록한 사람은 만든다", () => {
  const twoProjects = [usage("a"), usage("a", { myTechnologyId: "mt-a-2" })];
  const first = run({ usages: twoProjects });
  const again = run({ usages: twoProjects, existingAlertKeys: new Set(first.map((a) => a.dedupeKey)) });
  const secondUser = run({ usages: [...twoProjects, usage("late-user")], existingAlertKeys: new Set(first.map((a) => a.dedupeKey)) });

  assert.deepEqual(first.map((a) => a.myTechnologyId), ["mt-a"]);
  assert.deepEqual(again, []);
  assert.deepEqual(secondUser.map((a) => a.userId), ["late-user"]);
});

test("새 기술이 지원 종료(deprecated)이거나 사라졌으면(gone) 만들지 않고, 쓰는 중(active)·쉬는 중(dormant)이면 만든다", () => {
  assert.deepEqual(run({ newTech: { ...newTech, status: "deprecated" } }), []);
  assert.deepEqual(run({ newTech: { ...newTech, status: "gone" } }), []);
  assert.equal(run({ newTech: { ...newTech, status: "dormant" } }).length, 2);
  assert.equal(run().length, 2);
});
