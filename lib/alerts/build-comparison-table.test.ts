import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComparison, buildComparisonTable, type ComparableTech } from "./build-comparison.ts";

// PRD-F42 비교 모드: 기술 2–3개를 나란히. 적용 기회 비교표(F16)와 같은 5항목·출처 규칙.
const full = (name: string): ComparableTech => ({
  oneLiner: `${name} 설명`, oneLinerSource: `https://registry.example/${name}`, grade: "pass", gradeReason: "알려진 문제가 없어요", gradeEvidenceUrl: null,
  lastActivityAt: "2026-11-10T15:00:00Z", lastActivityKind: "release", repoUrl: `https://github.com/o/${name}`, license: "MIT", signals: { weekly_downloads: 12000 },
});
const empty: ComparableTech = {
  oneLiner: null, oneLinerSource: null, grade: "unknown", gradeReason: null, gradeEvidenceUrl: null,
  lastActivityAt: null, lastActivityKind: null, repoUrl: null, license: null, signals: null,
};

test("기술 2–3개를 같은 5항목으로 나란히 만든다: 칸 순서는 고른 순서", () => {
  const rows = buildComparisonTable([full("a"), full("b"), empty]);

  assert.deepEqual(rows.map((r) => r.item), ["하는 일", "보안 등급과 이유", "최근 업데이트", "사용량", "라이선스"]);
  assert.equal(rows.every((r) => r.cells.length === 3), true);
  assert.deepEqual(rows[0].cells[0], { value: "a 설명", source: "https://registry.example/a" });
  assert.deepEqual(rows[0].cells[1], { value: "b 설명", source: "https://registry.example/b" });
});

test("모든 칸에 값이 있거나 '찾지 못함'이다(추측하지 않는다, 불변 2)", () => {
  const rows = buildComparisonTable([full("a"), empty]);

  assert.deepEqual(rows.map((r) => r.cells[1]), Array(5).fill({ value: "찾지 못함", source: null }));
});

test("두 기술일 때는 적용 기회 비교표(buildComparison)와 같은 값이 나온다(같은 규칙을 쓴다)", () => {
  const mine = full("a");
  const theirs = full("b");

  const table = buildComparisonTable([mine, theirs]);
  const pair = buildComparison(mine, theirs);

  assert.deepEqual(table.map((r) => [r.item, r.cells[0], r.cells[1]]), pair.map((r) => [r.item, r.mine, r.theirs]));
});
