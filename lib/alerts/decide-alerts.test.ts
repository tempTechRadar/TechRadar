import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAlerts, type ChangeToAlert, type TechUsage } from "./decide-alerts.ts";

const change: ChangeToAlert = {
  id: "change-1",
  kind: "grade_to_danger",
  techId: "tech-mcp-remote",
  dedupeKey: "mcp-remote|0.1.15|CVE-2025-6514|1",
  isSimulated: false,
};

function usage(overrides: Partial<TechUsage> = {}): TechUsage {
  return {
    userId: "user-a",
    myTechnologyId: "mytech-a1",
    techId: "tech-mcp-remote",
    isDemo: false,
    hidden: false,
    archived: false,
    ...overrides,
  };
}

// 팀 결정 대기: 숨긴 기술·보관 프로젝트에도 위험 알림을 만들지(추천은 제외). 바뀌면 이 테스트만 고친다.
test("직접 숨긴 기술과 보관한 프로젝트의 기술은 알림에서 뺀다", () => {
  const usages = [
    usage({ userId: "hider", myTechnologyId: "mytech-h", hidden: true }),
    usage({ userId: "archiver", myTechnologyId: "mytech-r", archived: true }),
    usage({ userId: "active", myTechnologyId: "mytech-x" }),
  ];

  const alerts = decideAlerts({ change, usages, existingAlertKeys: new Set() });

  assert.deepEqual(alerts.map((a) => a.userId), ["active"]);
});

test("숨긴 줄과 보이는 줄을 함께 쓰면 보이는 줄로 알림 1건", () => {
  const usages = [
    usage({ userId: "user-a", myTechnologyId: "mytech-hidden", hidden: true }),
    usage({ userId: "user-a", myTechnologyId: "mytech-visible" }),
  ];

  const alerts = decideAlerts({ change, usages, existingAlertKeys: new Set() });

  assert.deepEqual(alerts.map((a) => a.myTechnologyId), ["mytech-visible"]);
});

test("시뮬레이터가 만든 가짜 변경은 시연 계정에만 알림을 만든다", () => {
  const usages = [
    usage({ userId: "demo", myTechnologyId: "mytech-demo", isDemo: true }),
    usage({ userId: "real", myTechnologyId: "mytech-real", isDemo: false }),
  ];

  const fake = decideAlerts({ change: { ...change, isSimulated: true }, usages, existingAlertKeys: new Set() });
  const real = decideAlerts({ change, usages, existingAlertKeys: new Set() });

  assert.deepEqual(fake.map((a) => a.userId), ["demo"]);
  assert.deepEqual(real.map((a) => a.userId), ["demo", "real"]);
});

test("같은 변경을 다시 돌려도 알림이 두 번 생기지 않는다", () => {
  const usages = [usage({ userId: "user-a" }), usage({ userId: "user-b", myTechnologyId: "mytech-b1" })];
  const first = decideAlerts({ change, usages, existingAlertKeys: new Set() });

  const second = decideAlerts({
    change,
    usages,
    existingAlertKeys: new Set(first.map((a) => a.dedupeKey)),
  });

  assert.deepEqual(second, []);
});

test("공용 변경이 이미 있어도 나중에 등록한 두 번째 사용자에게는 알림 1건", () => {
  const firstUser = [usage({ userId: "user-a" })];
  const alreadyAlerted = decideAlerts({ change, usages: firstUser, existingAlertKeys: new Set() });
  const bothUsers = [...firstUser, usage({ userId: "user-b", myTechnologyId: "mytech-b1" })];

  const alerts = decideAlerts({
    change,
    usages: bothUsers,
    existingAlertKeys: new Set(alreadyAlerted.map((a) => a.dedupeKey)),
  });

  assert.deepEqual(alerts.map((a) => a.userId), ["user-b"]);
});

test("한 사람이 같은 기술을 여러 프로젝트에 써도 알림은 1건", () => {
  const usages = [
    usage({ userId: "user-a", myTechnologyId: "mytech-a1" }),
    usage({ userId: "user-a", myTechnologyId: "mytech-a2" }),
  ];

  const alerts = decideAlerts({ change, usages, existingAlertKeys: new Set() });

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].userId, "user-a");
});

test("그 기술을 쓰는 사람마다 보안 알림 1건, 다른 기술을 쓰는 사람은 제외", () => {
  const usages = [
    usage({ userId: "user-a", myTechnologyId: "mytech-a1" }),
    usage({ userId: "user-b", myTechnologyId: "mytech-b1" }),
    usage({ userId: "user-c", myTechnologyId: "mytech-c1", techId: "tech-other" }),
  ];

  const alerts = decideAlerts({ change, usages, existingAlertKeys: new Set() });

  assert.deepEqual(
    alerts.map((a) => [a.userId, a.myTechnologyId, a.changeId, a.kind]),
    [
      ["user-a", "mytech-a1", "change-1", "security"],
      ["user-b", "mytech-b1", "change-1", "security"],
    ],
  );
});
