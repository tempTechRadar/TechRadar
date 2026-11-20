import { test } from "node:test";
import assert from "node:assert/strict";
import { toAlertView, type AlertRecord } from "./to-alert-view.ts";

const securityRecord: AlertRecord = {
  id: "alert-1",
  kind: "security",
  status: "pending",
  createdAt: "2026-11-18T01:30:00Z",
  projectId: "proj-1",
  projectName: "TechRadar",
  sourceFile: "package.json",
  judgment: null,
  comparison: null,
  change: {
    kind: "grade_to_danger",
    techName: "mcp-remote",
    detectedAt: "2026-11-18T01:30:00Z",
    draft: null,
    prevValue: { grade: "caution" },
    currValue: {
      grade: "danger",
      reason: "외부에서 내 컴퓨터 명령을 실행시킬 수 있어요",
      fixed_version: "0.1.16",
      evidence: [{ id: "CVE-2025-6514", severity: "HIGH", fixed: "0.1.16", url: "https://osv.dev/CVE-2025-6514" }],
    },
  },
};

test("보안 경고 알림을 목록 줄과 상세 문구로 바꾼다(등급은 한글로, 원인·출처는 증거에서)", () => {
  const view = toAlertView(securityRecord);

  assert.equal(view.kindLabel, "보안 경고");
  assert.equal(view.kindTone, "danger");
  assert.equal(view.statusLabel, "판단 대기");
  assert.equal(view.statusTone, "warning");
  assert.equal(view.title, "[보안 경고] mcp-remote — 주의 → 위험");
  assert.equal(view.subtitle, "내 프로젝트: TechRadar");
  assert.deepEqual(view.lines, [
    "무엇이 바뀌었나: CVE-2025-6514 (심각도 HIGH) (https://osv.dev/CVE-2025-6514, 2026-11-18 10:30)",
    "쉬운 이유: 외부에서 내 컴퓨터 명령을 실행시킬 수 있어요",
    "내 프로젝트: TechRadar · package.json",
  ]);
});

test("첫 점검 알림은 SPEC-5.2 문구, 부제에 '첫 점검'과 프로젝트 밖 표시", () => {
  const view = toAlertView({
    ...securityRecord,
    projectName: null,
    sourceFile: null,
    change: { ...securityRecord.change, kind: "first_seen_danger", prevValue: null },
  });

  assert.equal(view.title, "[첫 점검] mcp-remote은 지금 위험이에요");
  assert.equal(view.subtitle, "첫 점검 · 프로젝트 밖(내 컴퓨터)");
  assert.equal(view.lines[1], "고친 버전: 0.1.16");
});

test("판단을 마친 알림은 '완료'(성공 색)로 보인다", () => {
  const view = toAlertView({ ...securityRecord, status: "done" });

  assert.equal(view.statusLabel, "완료");
  assert.equal(view.statusTone, "success");
});

test("적용 기회 알림은 '적용 기회'(중립 색)와 기술 이름만 보이고, 상세 문구는 P-14에서 채운다", () => {
  const view = toAlertView({
    ...securityRecord,
    kind: "opportunity",
    change: { ...securityRecord.change, kind: "same_role_new", techName: "sample-mcp-d" },
  });

  assert.equal(view.kindLabel, "적용 기회");
  assert.equal(view.kindTone, "neutral");
  assert.equal(view.title, "[적용 기회] sample-mcp-d");
  assert.deepEqual(view.lines, []);
});

test("변경 값이 비었거나 깨져 있어도 죽지 않고 '찾지 못함'으로 채운다", () => {
  const view = toAlertView({ ...securityRecord, change: { ...securityRecord.change, prevValue: null, currValue: "깨진 값" } });

  assert.equal(view.title, "[보안 경고] mcp-remote — 찾지 못함 → 위험");
  assert.match(view.lines[0], /무엇이 바뀌었나: 찾지 못함/);
  assert.equal(view.lines[1], "쉬운 이유: 찾지 못함");
});

test("목록의 시각은 한국 시간 '11월 18일 10:30' 형식이다", () => {
  const view = toAlertView(securityRecord);

  assert.equal(view.createdAtLabel, "11월 18일 10:30");
});

test("판단한 알림은 부제에 판단이 붙고 상세에 '내 판단' 줄이 생긴다(보류는 이유, 적용 후보는 고친 버전)", () => {
  const hold = toAlertView({ ...securityRecord, status: "done", judgment: { decision: "hold", reason: "지금은 바꿀 시간이 없어요", fixedVersion: null, judgedAt: "2026-11-18T05:00:00Z" } });
  const candidate = toAlertView({ ...securityRecord, status: "done", judgment: { decision: "candidate", reason: null, fixedVersion: "0.1.16", judgedAt: "2026-11-18T05:00:00Z" } });

  assert.equal(hold.subtitle, "내 프로젝트: TechRadar · 판단: 보류");
  assert.equal(hold.judgmentLine, "보류 · 이유: 지금은 바꿀 시간이 없어요");
  assert.equal(candidate.subtitle, "내 프로젝트: TechRadar · 판단: 적용 후보");
  assert.equal(candidate.judgmentLine, "적용 후보 · 고친 버전 0.1.16");
  assert.equal(toAlertView(securityRecord).judgmentLine, null);
});

test("보안 경고에 고친 버전이 없으면 적용 후보를 고를 수 없다(보류만). 다른 알림은 늘 고를 수 있다", () => {
  const noFix = { ...securityRecord, change: { ...securityRecord.change, currValue: { grade: "danger", fixed_version: null } } };

  assert.equal(toAlertView(securityRecord).canCandidate, true);
  assert.equal(toAlertView(noFix).canCandidate, false);
  assert.equal(toAlertView({ ...noFix, kind: "opportunity" }).canCandidate, true);
});

test("판단한 날은 한국 시간 '11월 18일 14:00', 판단 전에는 null", () => {
  const done = toAlertView({ ...securityRecord, status: "done", judgment: { decision: "hold", reason: "지금은 바꿀 시간이 없어요", fixedVersion: null, judgedAt: "2026-11-18T05:00:00Z" } });

  assert.equal(done.judgedAtLabel, "11월 18일 14:00");
  assert.equal(toAlertView(securityRecord).judgedAtLabel, null);
});

test("모델 종료 알림(PRD-F38): 종료일 · 공식 추천 대체 · 찾은 파일 · 공지 주소. Google은 '가장 이르면'을 밝힌다", () => {
  const eol = (provider: string, source: string): AlertRecord => ({
    ...securityRecord,
    kind: "model_eol",
    sourceFile: "src/ai.ts",
    change: { ...securityRecord.change, kind: "model_eol", techName: "x", prevValue: null,
      currValue: { model: "gemini-2.0-flash", provider, retire_on: "2026-06-01", replacement: "gemini-3.6-flash", source } },
  });
  const view = toAlertView(eol("google", "https://aistudio.google.com/docs/deprecations"));
  assert.equal(view.kindLabel, "모델 종료");
  assert.equal(view.title, "[모델 종료] gemini-2.0-flash 지원 종료일 2026-06-01");
  assert.deepEqual(view.lines, [
    "모델: gemini-2.0-flash",
    "지원 종료일: 2026-06-01 (공지에 '가장 이르면 이날'로 적혀 있어요)",
    "공식 추천 대체: gemini-3.6-flash",
    "내 코드: TechRadar · src/ai.ts",
    "출처: Google 지원 종료 공지",
    "공지 주소: https://aistudio.google.com/docs/deprecations",
  ]);
  assert.equal(view.draftCard, null, "초안은 보안 경고에만");
  assert.equal(view.canCandidate, true);
  assert.equal(toAlertView(eol("anthropic", "https://platform.claude.com/x")).lines[1], "지원 종료일: 2026-06-01");
  const broken = toAlertView({ ...eol("google", ""), change: { ...securityRecord.change, kind: "model_eol", techName: "claude-2.1", currValue: null } });
  assert.deepEqual(broken.lines.slice(0, 3), ["모델: claude-2.1", "지원 종료일: 찾지 못함", "공식 추천 대체: 찾지 못함"]);
});
