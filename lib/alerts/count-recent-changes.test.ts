import { test } from "node:test";
import assert from "node:assert/strict";
import { countRecentChanges } from "./count-recent-changes.ts";

// PRD-F43 이번 주 요약 카드: "내 기술 변화 n건"(앱 안에서만). 내 알림이 생긴 수로 센다.
const now = new Date("2026-11-18T03:00:00Z");
const at = (createdAt: string) => ({ createdAt });

test("최근 7일(지금부터 거꾸로)에 생긴 알림만 센다: 정확히 7일 전은 포함, 그보다 오래되면 제외", () => {
  const alerts = [
    at("2026-11-18T01:00:00Z"), // 오늘
    at("2026-11-11T03:00:00Z"), // 정확히 7일 전
    at("2026-11-11T02:59:59Z"), // 7일보다 1초 오래됨
    at("2026-10-01T00:00:00Z"),
  ];

  assert.equal(countRecentChanges(alerts, now), 2);
});

test("알림이 없으면 0이고, 미래 시각(시계 차이)이 섞여도 이번 주로 센다", () => {
  assert.equal(countRecentChanges([], now), 0);
  assert.equal(countRecentChanges([at("2026-11-18T03:00:30Z")], now), 1);
});
