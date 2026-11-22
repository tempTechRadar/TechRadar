import { test } from "node:test";
import assert from "node:assert/strict";
import { decidedMarks } from "./map-queries.ts";

test("지도 판단 칩의 값 = 청사진 후보 탭과 같은 계산: 지도 표시와 알림 판단 중 더 최근 것이 이긴다", () => {
  const marks = [
    { tech_id: "a", status: "interest", updated_at: "2026-11-20T00:00:00Z" }, // 그 뒤 알림에서 보류 → 보류
    { tech_id: "b", status: "hold", updated_at: "2026-11-22T00:00:00Z" }, // 알림 판단보다 최근 → 보류 그대로
    { tech_id: "c", status: "interest", updated_at: "2026-11-21T00:00:00Z" }, // 알림 없음 → 관심
  ];
  const alerts = [
    { changes: { tech_id: "a" }, judgments: { decision: "hold", judged_at: "2026-11-21T00:00:00Z" } },
    { changes: { tech_id: "b" }, judgments: [{ decision: "candidate", judged_at: "2026-11-21T00:00:00Z" }] }, // 배열로 와도
    { changes: { tech_id: "d" }, judgments: { decision: "candidate", judged_at: "2026-11-21T00:00:00Z" } }, // 지도 표시 없이 알림에서만
    { changes: { tech_id: "e" }, judgments: null }, // 아직 판단 안 함
  ];
  assert.deepEqual(decidedMarks(marks, alerts), { a: "hold", b: "hold", c: "interest", d: "candidate" });
});
