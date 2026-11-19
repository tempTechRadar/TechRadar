import { test } from "node:test";
import assert from "node:assert/strict";
import { findReviewDue, type ReviewCandidate } from "./find-review-due.ts";

// PRD-F41 보류 회고: 보류한 지 30일이 지나면 앱 안에서 "다시 볼까요?". 판단 대기 수에는 들어가지 않는다.
const now = new Date("2026-11-18T03:00:00Z");

function alert(id: string, judgment: ReviewCandidate["judgment"], techName = `기술 ${id}`): ReviewCandidate {
  return { id, change: { techName }, judgment };
}
const hold = (judgedAt: string, reason: string | null = "지금은 바꿀 시간이 없어요") => ({ decision: "hold" as const, reason, judgedAt });

test("보류한 지 30일 이상 된 것만, 오래된 순으로 찾고 며칠 전인지 센다(정확히 30일은 포함, 29일은 제외)", () => {
  const found = findReviewDue(
    [
      alert("new", hold("2026-11-10T03:00:00Z")), // 8일 전
      alert("edge", hold("2026-10-19T03:00:00Z")), // 정확히 30일 전
      alert("old", hold("2026-10-07T03:00:00Z")), // 42일 전
      alert("almost", hold("2026-10-20T03:00:00Z")), // 29일 전
    ],
    now,
  );

  assert.deepEqual(found, [
    { id: "old", techName: "기술 old", reason: "지금은 바꿀 시간이 없어요", judgedAt: "2026-10-07T03:00:00Z", judgedOn: "10월 7일", daysAgo: 42 },
    { id: "edge", techName: "기술 edge", reason: "지금은 바꿀 시간이 없어요", judgedAt: "2026-10-19T03:00:00Z", judgedOn: "10월 19일", daysAgo: 30 },
  ]);
});

test("적용 후보로 판단한 것과 판단하지 않은 알림은 회고 대상이 아니다", () => {
  const found = findReviewDue(
    [
      alert("candidate", { decision: "candidate", reason: null, judgedAt: "2026-09-01T00:00:00Z" }),
      alert("pending", null),
      alert("hold", hold("2026-09-01T00:00:00Z")),
    ],
    now,
  );

  assert.deepEqual(found.map((f) => f.id), ["hold"]);
});

test("한 번에 5건까지만 보여 준다(가장 오래된 5건)", () => {
  const many = Array.from({ length: 8 }, (_, i) => alert(`h${i}`, hold(`2026-09-0${i + 1}T00:00:00Z`)));

  assert.deepEqual(findReviewDue(many, now).map((f) => f.id), ["h0", "h1", "h2", "h3", "h4"]);
});

test("이유가 비어 있으면 '찾지 못함'으로 채운다", () => {
  const [item] = findReviewDue([alert("a", hold("2026-09-01T00:00:00Z", null))], now);

  assert.equal(item.reason, "찾지 못함");
});
