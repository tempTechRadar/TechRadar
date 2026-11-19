// 분류 확인 화면의 입력 검사(P-18b, IA-17, ADR 0015): 사유와 새 규칙. DB에 가기 전에 거른다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkNewRule, checkReason } from "./classify-input.ts";

test("사유는 앞뒤 공백을 빼고 5자 이상 300자 이하만 받는다", () => {
  assert.deepEqual(checkReason("  공식 문서 확인함  "), { ok: true, reason: "공식 문서 확인함" });
  assert.equal(checkReason("짧음").ok, false);
  assert.equal(checkReason("    ").ok, false);
  assert.equal(checkReason("가".repeat(301)).ok, false);
  assert.equal(checkReason("가".repeat(300)).ok, true);
});

test("사유에 비밀값처럼 보이는 글이 있으면 거절한다(audit_logs에 남지 않게)", () => {
  // 가짜 키 모양을 실행 중에 만든다(저장소에 키처럼 보이는 글자를 두지 않게).
  assert.equal(checkReason(`키는 ${["sk", "ant", "api03", "abcdefghijklmnopqrstuvwxyz"].join("-")} 입니다`).ok, false);
});

test("새 규칙: 허용 패키지는 생태계(npm·pypi)가 꼭 있어야 하고, 다른 종류는 생태계를 비운다", () => {
  assert.deepEqual(checkNewRule({ kind: "allow_package", ecosystem: "npm", value: " @scope/pkg " }), { ok: true, rule: { kind: "allow_package", ecosystem: "npm", value: "@scope/pkg" } });
  assert.equal(checkNewRule({ kind: "allow_package", ecosystem: "", value: "pkg" }).ok, false);
  assert.equal(checkNewRule({ kind: "allow_package", ecosystem: "cargo", value: "pkg" }).ok, false);
  assert.deepEqual(checkNewRule({ kind: "github_topic", ecosystem: "npm", value: "mcp-server" }), { ok: true, rule: { kind: "github_topic", ecosystem: null, value: "mcp-server" } });
  assert.equal(checkNewRule({ kind: "official_org", ecosystem: "", value: "anthropics" }).ok, true);
  assert.equal(checkNewRule({ kind: "hn_keyword", ecosystem: "", value: "MCP" }).ok, true);
});

test("새 규칙: 위험 패턴은 코드 규칙(SPEC-2)과 짝이라 화면에서 새로 만들지 않는다. 모르는 종류도 거절", () => {
  assert.equal(checkNewRule({ kind: "risk_pattern", ecosystem: "", value: "P9" }).ok, false);
  assert.equal(checkNewRule({ kind: "drop table", ecosystem: "", value: "x" }).ok, false);
});

test("새 규칙 값: 비거나 100자를 넘거나 공백·비밀값이 있으면 거절", () => {
  assert.equal(checkNewRule({ kind: "hn_keyword", ecosystem: "", value: "   " }).ok, false);
  assert.equal(checkNewRule({ kind: "hn_keyword", ecosystem: "", value: "a".repeat(101) }).ok, false);
  assert.equal(checkNewRule({ kind: "github_topic", ecosystem: "", value: "two words" }).ok, false);
  assert.equal(checkNewRule({ kind: "hn_keyword", ecosystem: "", value: ["ghp", "abcdefghijklmnopqrstuvwxyz0123456789"].join("_") }).ok, false);
});
