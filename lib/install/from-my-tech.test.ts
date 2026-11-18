import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInstallPrompt } from "./build-install-prompt.ts";
import { fixedVersionOf, toInstallItems, type MyTechRow } from "./from-my-tech.ts";
import { IMPORT_PROMPT } from "./import-prompt.ts";
import { parseImportLines } from "./parse-import-lines.ts";

const row = (extra: Partial<MyTechRow> = {}): MyTechRow => ({
  id: "m1", origin: "repo", version: "0.1.16", grade: "pass", grade_reason: null, grade_evidence: null, hidden_at: null,
  technologies: { tech_key: "npm:mcp-remote", type: "mcp", repo_url: "https://github.com/geelen/mcp-remote" },
  ...extra,
});
const danger = row({
  id: "m2", version: "0.1.15", grade: "danger", grade_reason: "위험: GHSA-6xpm-ggf7-wc3p (CRITICAL) — 0.1.16에서 고침",
  grade_evidence: [{ id: "GHSA-6xpm-ggf7-wc3p", severity: "CRITICAL", fixed: "0.1.16" }],
});

test("저장소에서 읽은 기술은 기술 키에서 생태계·패키지를 꺼내 프롬프트에 들어간다", () => {
  const { items } = toInstallItems([row()], new Map(), new Set());
  assert.deepEqual(items[0], { kind: "mcp", ecosystem: "npm", pkg: "mcp-remote", name: "mcp-remote", source: "repo", version: "0.1.16", scope: "project", link: "https://github.com/geelen/mcp-remote", pinTo: undefined });
  assert.match(buildInstallPrompt(items).text, /- mcp-remote \| npm mcp-remote@0\.1\.16 \| 설정 위치: \.mcp\.json/);
});

test("위험은 기본으로 빠지고 고친 버전이 적힌다. 사용자가 고르면 '위험: ID'가 붙어 들어간다", () => {
  const off = buildInstallPrompt(toInstallItems([danger], new Map(), new Set()).items);
  assert.equal(off.includedCount, 0);
  assert.match(off.text, /\[넣지 않은 것 \(위험\)\]\n- mcp-remote@0\.1\.15 — 위험: GHSA-6xpm-ggf7-wc3p .*0\.1\.16\(으\)로 바꾸면/);
  const on = buildInstallPrompt(toInstallItems([danger], new Map(), new Set(["m2"])).items);
  assert.equal(on.includedCount, 1);
  assert.match(on.text, /- mcp-remote \| npm mcp-remote@0\.1\.15 .*\| 위험: GHSA-6xpm-ggf7-wc3p/);
});

test("보안 경고에서 적용 후보를 고른 기술은 고친 버전으로 고정되고 위험으로 빠지지 않는다(ADR 0012)", () => {
  const r = buildInstallPrompt(toInstallItems([danger], new Map([["m2", "0.1.16"]]), new Set()).items);
  assert.equal(r.includedCount, 1);
  assert.match(r.text, /npm mcp-remote@0\.1\.16/);
  assert.equal(r.text.includes("0.1.15"), false);
});

test("직접 이름만 쓴 기술·패키지가 아닌 키·숨긴 기술은 넣지 않는다(세 출처만, SPEC-4.3)", () => {
  const { items, notIncluded } = toInstallItems([
    row({ id: "a", origin: "manual", technologies: null }),
    row({ id: "b", technologies: { tech_key: "url:example.com", type: "service", repo_url: null } }),
    row({ id: "c", hidden_at: "2026-11-18T00:00:00Z" }),
  ], new Map(), new Set());
  assert.equal(items.length, 0);
  assert.deepEqual(notIncluded.map((n) => n.id), ["a", "b"]);
});

test("가져온 기술은 사용자 설정 위치로, 스킬 키는 GitHub 경로로 바뀐다", () => {
  const { items } = toInstallItems([
    row({ id: "i", origin: "import", technologies: { tech_key: "pypi:mcp-server-time", type: "mcp", repo_url: null } }),
    row({ id: "s", version: null, technologies: { tech_key: "skill:owner/repo/demo", type: "skill", repo_url: null } }),
  ], new Map(), new Set());
  assert.deepEqual([items[0].ecosystem, items[0].scope, items[0].source], ["pypi", "user", "import"]);
  assert.deepEqual([items[1].kind, items[1].pkg, items[1].name], ["skill", "github.com/owner/repo/.claude/skills/demo", "demo"]);
});

test("허용하지 않는 곳의 저장소 주소는 링크로 넘기지 않는다", () => {
  const { items } = toInstallItems([row({ technologies: { tech_key: "npm:x", type: "sdk", repo_url: "https://gitlab.com/a/b" } })], new Map(), new Set());
  assert.equal(items[0].link, undefined);
});

test("고친 버전: HIGH·CRITICAL을 모두 고치는 가장 높은 버전, 하나라도 고친 버전이 없으면 없음", () => {
  assert.equal(fixedVersionOf([{ severity: "HIGH", fixed: "0.14.1" }, { severity: "CRITICAL", fixed: "0.16.6" }, { severity: "LOW", fixed: "9.0.0" }]), "0.16.6");
  assert.equal(fixedVersionOf([{ severity: "HIGH", fixed: null }]), undefined);
  assert.equal(fixedVersionOf(null), undefined);
});

test("가져오기 글의 예시 줄은 실제로 가져오기 규칙을 통과한다", () => {
  const example = /예: (.+)\)\.$/.exec(IMPORT_PROMPT)![1];
  const r = parseImportLines(example);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].ecosystem, "npm");
});
