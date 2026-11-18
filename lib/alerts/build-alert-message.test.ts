import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlertMessage, type AlertMessageInput } from "./build-alert-message.ts";

const securityWarning: AlertMessageInput = {
  kind: "grade_to_danger",
  techName: "mcp-remote",
  prevGrade: "주의",
  causeText: "원격 명령 실행 취약점 발견",
  source: "OSV CVE-2025-6514",
  detectedAt: "2026-11-18T01:30:00Z",
  easyReason: "외부에서 내 컴퓨터 명령을 실행시킬 수 있어요",
  projectName: "TechRadar",
  sourceFile: "package.json",
  fixedVersion: null,
};

test("첫 점검 문구는 SPEC-5.2 형식이고, 고친 버전이 없으면 '아직 없음'", () => {
  const firstCheck: AlertMessageInput = { ...securityWarning, kind: "first_seen_danger" };

  const withoutFix = buildAlertMessage(firstCheck);
  const withFix = buildAlertMessage({ ...firstCheck, fixedVersion: "0.1.16" });

  assert.equal(withoutFix.title, "[첫 점검] mcp-remote은 지금 위험이에요");
  assert.deepEqual(withoutFix.lines, [
    "이유: 외부에서 내 컴퓨터 명령을 실행시킬 수 있어요 (OSV CVE-2025-6514)",
    "고친 버전: 아직 없음",
  ]);
  assert.equal(withFix.lines[1], "고친 버전: 0.1.16");
});

test("값이 없는 칸은 '찾지 못함'으로 채운다", () => {
  const empty: AlertMessageInput = {
    kind: "grade_to_danger",
    techName: "mcp-remote",
    prevGrade: null,
    causeText: null,
    source: null,
    detectedAt: null,
    easyReason: null,
    projectName: null,
    sourceFile: null,
    fixedVersion: null,
  };

  const message = buildAlertMessage(empty);

  assert.equal(message.title, "[보안 경고] mcp-remote — 찾지 못함 → 위험");
  assert.deepEqual(message.lines, [
    "무엇이 바뀌었나: 찾지 못함 (찾지 못함, 찾지 못함)",
    "쉬운 이유: 찾지 못함",
    "내 프로젝트: 찾지 못함 · 찾지 못함",
  ]);
});

test("보안 경고 문구는 SPEC-5.1 형식이고 시각은 한국 시간이다", () => {
  const message = buildAlertMessage(securityWarning);

  assert.equal(message.title, "[보안 경고] mcp-remote — 주의 → 위험");
  assert.deepEqual(message.lines, [
    "무엇이 바뀌었나: 원격 명령 실행 취약점 발견 (OSV CVE-2025-6514, 2026-11-18 10:30)",
    "쉬운 이유: 외부에서 내 컴퓨터 명령을 실행시킬 수 있어요",
    "내 프로젝트: TechRadar · package.json",
  ]);
});
