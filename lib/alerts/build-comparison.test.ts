import { test } from "node:test";
import assert from "node:assert/strict";
import { buildComparison, type ComparableTech } from "./build-comparison.ts";

const mine: ComparableTech = {
  oneLiner: "원격 MCP 서버에 연결해 줘요", oneLinerSource: "https://registry.example/mcp-mine",
  grade: "caution", gradeReason: "덜 심각한 알려진 문제가 1건 있어요", gradeEvidenceUrl: "https://osv.dev/GHSA-1",
  lastActivityAt: "2026-11-10T15:00:00Z", lastActivityKind: "release", repoUrl: "https://github.com/o/mine",
  license: "MIT", signals: { weekly_downloads: 12000 },
};
const theirs: ComparableTech = {
  oneLiner: "원격 MCP 연결 프록시", oneLinerSource: "https://registry.example/mcp-new",
  grade: "pass", gradeReason: "알려진 문제가 없어요", gradeEvidenceUrl: null,
  lastActivityAt: "2026-11-17T20:00:00Z", lastActivityKind: "commit", repoUrl: "https://github.com/o/new",
  license: "Apache-2.0", signals: { weekly_downloads: 800 },
};

test("항목 5개(하는 일·보안 등급과 이유·최근 업데이트·사용량·라이선스)를 내 기술과 새 기술 값, 출처와 함께 만든다", () => {
  const rows = buildComparison(mine, theirs);

  assert.deepEqual(rows.map((r) => r.item), ["하는 일", "보안 등급과 이유", "최근 업데이트", "사용량", "라이선스"]);
  assert.deepEqual(rows[0], {
    item: "하는 일",
    mine: { value: "원격 MCP 서버에 연결해 줘요", source: "https://registry.example/mcp-mine" },
    theirs: { value: "원격 MCP 연결 프록시", source: "https://registry.example/mcp-new" },
  });
  assert.deepEqual(rows[1].mine, { value: "주의 — 덜 심각한 알려진 문제가 1건 있어요", source: "https://osv.dev/GHSA-1" });
  assert.deepEqual(rows[2].mine, { value: "2026-11-11 (릴리스)", source: "https://github.com/o/mine" });
  assert.deepEqual(rows[2].theirs, { value: "2026-11-18 (커밋)", source: "https://github.com/o/new" });
  assert.equal(rows[3].mine.value, "주간 12,000회 다운로드");
  assert.deepEqual(rows[4].theirs, { value: "Apache-2.0", source: "https://github.com/o/new" });
});

test("값이 없는 칸은 '찾지 못함'과 출처 없음(null)으로 채우고, 값이 있어도 출처가 없으면 출처만 null", () => {
  const empty: ComparableTech = {
    oneLiner: null, oneLinerSource: null, grade: "unknown", gradeReason: null, gradeEvidenceUrl: null,
    lastActivityAt: null, lastActivityKind: null, repoUrl: null, license: null, signals: null,
  };

  const rows = buildComparison(empty, { ...theirs, gradeEvidenceUrl: null });

  assert.deepEqual(rows.map((r) => r.mine), Array(5).fill({ value: "찾지 못함", source: null }));
  assert.deepEqual(rows[1].theirs, { value: "통과 — 알려진 문제가 없어요", source: null });
});

test("라이선스: none은 '라이선스 없음', other는 '종류를 알아보지 못함'으로 읽고(영어 내부 값을 보이지 않음), 출처는 저장소 그대로", () => {
  const rows = buildComparison({ ...mine, license: "none" }, { ...theirs, license: "other" });

  assert.deepEqual(rows[4].mine, { value: "라이선스 없음", source: "https://github.com/o/mine" });
  assert.deepEqual(rows[4].theirs, { value: "종류를 알아보지 못함", source: "https://github.com/o/new" });
});

test("라이선스: 알아본 이름(MIT)은 그대로, 못 읽은 값(null)은 '라이선스 없음'이 아니라 '찾지 못함'", () => {
  const rows = buildComparison(mine, { ...theirs, license: null });

  assert.deepEqual(rows[4].mine, { value: "MIT", source: "https://github.com/o/mine" });
  assert.deepEqual(rows[4].theirs, { value: "찾지 못함", source: null });
});
