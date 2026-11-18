import { test } from "node:test";
import assert from "node:assert/strict";
import { toAlertView, type AlertRecord } from "./to-alert-view.ts";

// 알림 상세의 "대응안 초안" 카드(IA-7, PRD-F15, 와이어프레임 docs/wireframes/alerts.html#detail)에 찍을 값

const securityRecord: AlertRecord = {
  id: "alert-1",
  kind: "security",
  status: "pending",
  createdAt: "2026-11-18T01:30:00Z",
  projectId: null,
  projectName: null,
  sourceFile: null,
  judgment: null,
  comparison: null,
  change: {
    kind: "grade_to_danger",
    techName: "mcp-remote",
    detectedAt: "2026-11-18T01:30:00Z",
    prevValue: { grade: "caution" },
    currValue: { grade: "danger", fixed_version: "0.1.16" },
    draft: { text: "고친 버전 0.1.16으로 올리기를 권해요.", sources: ["https://osv.dev/CVE-1", "javascript:alert(1)"] },
  },
};

test("보안 경고에 초안이 있으면 글과 출처(http(s) 주소만)를 준다", () => {
  const card = toAlertView(securityRecord).draftCard;

  assert.deepEqual(card, { state: "ready", text: "고친 버전 0.1.16으로 올리기를 권해요.", sources: ["https://osv.dev/CVE-1"] });
});

test("보안 경고인데 초안이 없으면 '만들지 못함' 상태(알림은 있다), 보안이 아닌 알림에는 초안 카드 자체가 없다", () => {
  const missing = toAlertView({ ...securityRecord, change: { ...securityRecord.change, draft: null } });
  const opportunity = toAlertView({ ...securityRecord, kind: "opportunity", change: { ...securityRecord.change, kind: "same_role_new" } });

  assert.deepEqual(missing.draftCard, { state: "missing" });
  assert.equal(opportunity.draftCard, null);
});

test("출처가 하나도 없으면 빈 목록으로 준다(화면이 '출처 찾지 못함'을 보여 준다)", () => {
  const view = toAlertView({ ...securityRecord, change: { ...securityRecord.change, draft: { text: "초안", sources: [] } } });

  assert.deepEqual(view.draftCard, { state: "ready", text: "초안", sources: [] });
});
