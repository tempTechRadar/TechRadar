import { test } from "node:test";
import assert from "node:assert/strict";
import { findSimilarJudgments, type CurrentContext, type PastJudgment } from "./find-similar-judgments.ts";

function past(alertId: string, overrides: Partial<PastJudgment> = {}): PastJudgment {
  return {
    alertId, techId: "tech-x", techName: "다른 기술", categoryId: "cat-x", decision: "hold",
    reason: "마감이라 나중에", grade: "위험", judgedAt: "2026-11-01T00:00:00Z", ...overrides,
  };
}

const current: CurrentContext = { alertId: "now", techId: "tech-1", categoryId: "cat-1", sameRoleTechIds: ["tech-2"] };
const ids = (rows: { alertId: string }[]) => rows.map((r) => r.alertId);

test("같은 기술 → 확정된 같은 역할 → 같은 갈래 순으로, 각 순서 안에서는 최근 것부터 찾는다", () => {
  const history = [
    past("cat-old", { categoryId: "cat-1", judgedAt: "2026-11-02T00:00:00Z" }),
    past("role", { techId: "tech-2", judgedAt: "2026-11-03T00:00:00Z" }),
    past("same-old", { techId: "tech-1", judgedAt: "2026-11-01T00:00:00Z" }),
    past("same-new", { techId: "tech-1", judgedAt: "2026-11-05T00:00:00Z" }),
  ];

  const found = findSimilarJudgments(current, history);

  assert.deepEqual(ids(found), ["same-new", "same-old", "role"]);
  assert.deepEqual(found.map((f) => f.match), ["same_tech", "same_tech", "same_role"]);
});

test("모두 합쳐 3개까지만 보여 준다(앞 순서가 먼저 자리를 차지)", () => {
  const history = [
    past("a", { techId: "tech-1", judgedAt: "2026-11-01T00:00:00Z" }),
    past("b", { techId: "tech-1", judgedAt: "2026-11-02T00:00:00Z" }),
    past("c", { techId: "tech-1", judgedAt: "2026-11-03T00:00:00Z" }),
    past("d", { techId: "tech-1", judgedAt: "2026-11-04T00:00:00Z" }),
    past("role", { techId: "tech-2", judgedAt: "2026-11-10T00:00:00Z" }),
  ];

  assert.deepEqual(ids(findSimilarJudgments(current, history)), ["d", "c", "b"]);
});

test("한 판단은 처음 맞는 순서에 한 번만 나오고, 지금 보는 알림과 아무 관계 없는 판단은 뺀다", () => {
  const history = [
    past("both", { techId: "tech-1", categoryId: "cat-1" }),
    past("self", { alertId: "now", techId: "tech-1" }),
    past("unrelated", { techId: "tech-9", categoryId: "cat-9" }),
  ];

  const found = findSimilarJudgments(current, history);

  assert.deepEqual(ids(found), ["both"]);
  assert.equal(found[0].match, "same_tech");
});

test("갈래를 모르는 기술끼리(둘 다 갈래 없음)는 같은 갈래로 치지 않는다", () => {
  const noCategory: CurrentContext = { ...current, categoryId: null, sameRoleTechIds: [] };

  assert.deepEqual(findSimilarJudgments(noCategory, [past("x", { categoryId: null })]), []);
});
