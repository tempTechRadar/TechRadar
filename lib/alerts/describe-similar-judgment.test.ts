import { test } from "node:test";
import assert from "node:assert/strict";
import { describeSimilarJudgment } from "./describe-similar-judgment.ts";
import type { SimilarJudgment } from "./find-similar-judgments.ts";

const base: SimilarJudgment = {
  alertId: "a1", techId: "t1", techName: "mcp-remote", categoryId: "c1", decision: "hold",
  reason: "마감이라 나중에", grade: "위험", judgedAt: "2026-11-05T00:00:00Z", match: "same_tech",
};

test("보류는 이유를, 맞은 이유(같은 기술·역할·갈래)와 판단한 날(한국 시간)과 그때 등급을 보여 준다", () => {
  assert.deepEqual(describeSimilarJudgment(base), {
    title: "mcp-remote · 보류",
    detail: "이유: 마감이라 나중에",
    meta: "같은 기술 · 11월 5일 · 그때 등급 위험",
  });
  assert.equal(describeSimilarJudgment({ ...base, match: "same_role" }).meta.startsWith("같은 역할"), true);
  assert.equal(describeSimilarJudgment({ ...base, match: "same_category" }).meta.startsWith("같은 갈래"), true);
});

test("적용 후보는 이유 대신 한 줄 안내, 값이 없으면 '찾지 못함'", () => {
  const candidate = describeSimilarJudgment({ ...base, decision: "candidate", reason: null, grade: null });
  const noReason = describeSimilarJudgment({ ...base, reason: null });

  assert.equal(candidate.title, "mcp-remote · 적용 후보");
  assert.equal(candidate.detail, "적용 후보로 정했어요");
  assert.equal(candidate.meta, "같은 기술 · 11월 5일 · 그때 등급 찾지 못함");
  assert.equal(noReason.detail, "이유: 찾지 못함");
});
