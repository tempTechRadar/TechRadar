import { test } from "node:test";
import assert from "node:assert/strict";
import { toAlertView, type AlertRecord } from "./to-alert-view.ts";

// 적용 기회 알림 상세(IA-7, SPEC-5.3, 와이어프레임 docs/wireframes/alerts.html#opportunity)에 찍을 값

const opportunityRecord: AlertRecord = {
  id: "alert-2",
  kind: "opportunity",
  status: "pending",
  createdAt: "2026-11-18T03:00:00Z",
  projectId: "proj-1",
  projectName: "TechRadar",
  sourceFile: "package.json",
  judgment: null,
  comparison: {
    myTechName: "mcp-mine",
    newTechName: "mcp-new",
    confirmedAt: "2026-11-18T01:00:00Z",
    rows: [
      { item: "하는 일", mine: { value: "원격 MCP 서버에 연결해 줘요", source: "https://registry.example/mine" }, theirs: { value: "원격 MCP 연결 프록시", source: "공식 레지스트리 설명" } },
      { item: "사용량", mine: { value: "주간 12,000회 다운로드", source: null }, theirs: { value: "찾지 못함", source: null } },
    ],
  },
  change: { kind: "same_role_new", techName: "mcp-new", detectedAt: "2026-11-18T01:00:00Z", prevValue: null, currValue: null, draft: null },
};

test("적용 기회 상세는 조사 없는 제목, 나오게 된 이유(확정한 날, 한국 시간), 비교표를 준다", () => {
  const view = toAlertView(opportunityRecord);

  assert.equal(view.title, "[적용 기회] 같은 역할의 새 기술 mcp-new (내 기술: mcp-mine)");
  assert.equal(view.reasonLine, "내 기술(mcp-mine)과 같은 역할로 확정됐어요. 확정한 날: 11월 18일.");
  assert.deepEqual(view.lines, []);
  assert.equal(view.canCandidate, true); // 적용 기회는 고친 버전이 필요 없다
  assert.deepEqual(view.comparison?.headers, { mine: "내 기술 mcp-mine", theirs: "새 기술 mcp-new" });
  assert.equal(view.comparison?.rows.length, 2);
});

test("출처는 http(s) 주소만 링크로 쓰고, 그 밖의 글은 글자로만 보이며, 없으면 null(javascript: 같은 주소는 링크로 만들지 않는다)", () => {
  const withBadLink: AlertRecord = {
    ...opportunityRecord,
    comparison: {
      ...opportunityRecord.comparison!,
      rows: [{ item: "라이선스", mine: { value: "MIT", source: "javascript:alert(1)" }, theirs: { value: "MIT", source: "https://github.com/o/new" } }],
    },
  };

  const row = toAlertView(withBadLink).comparison!.rows[0];

  assert.deepEqual(row.mine, { value: "MIT", source: "javascript:alert(1)", sourceIsLink: false });
  assert.deepEqual(row.theirs, { value: "MIT", source: "https://github.com/o/new", sourceIsLink: true });
  const [first, second] = toAlertView(opportunityRecord).comparison!.rows;
  assert.deepEqual(first.theirs, { value: "원격 MCP 연결 프록시", source: "공식 레지스트리 설명", sourceIsLink: false });
  assert.deepEqual(second.mine, { value: "주간 12,000회 다운로드", source: null, sourceIsLink: false });
});

test("저장된 비교표가 없거나 확정한 날을 모르면 있는 만큼만 보여 준다(없는 값은 '찾지 못함')", () => {
  const noComparison = toAlertView({ ...opportunityRecord, comparison: null });
  const noDate = toAlertView({ ...opportunityRecord, comparison: { ...opportunityRecord.comparison!, confirmedAt: null } });

  assert.equal(noComparison.title, "[적용 기회] mcp-new");
  assert.equal(noComparison.reasonLine, null);
  assert.equal(noComparison.comparison, null);
  assert.equal(noDate.reasonLine, "내 기술(mcp-mine)과 같은 역할로 확정됐어요. 확정한 날: 찾지 못함.");
});

test("보안 경고에는 이유 줄과 비교표가 없다", () => {
  const view = toAlertView({ ...opportunityRecord, kind: "security", comparison: null, change: { ...opportunityRecord.change, kind: "grade_to_danger" } });

  assert.equal(view.reasonLine, null);
  assert.equal(view.comparison, null);
});
