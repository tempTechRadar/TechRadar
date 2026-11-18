import { test } from "node:test";
import assert from "node:assert/strict";
import type { InstallItem } from "./types.ts";
import { hasInstructionWord, validateItem } from "./validate-item.ts";

const base: InstallItem = { kind: "mcp", name: "mcp-remote", source: "repo", ecosystem: "npm", pkg: "mcp-remote", version: "0.1.16" };
const reasonOf = (item: InstallItem) => {
  const v = validateItem(item);
  assert.equal(v.ok, false);
  return v.ok ? "" : v.reason;
};

test("정상 항목은 같은 값 그대로 통과한다", () => {
  const v = validateItem(base);
  assert.equal(v.ok, true);
  assert.deepEqual(v.ok && v.item, base);
});

test("npm 이름 규칙: scope 이름은 통과, 대문자·공백은 막는다", () => {
  assert.equal(validateItem({ ...base, pkg: "@modelcontextprotocol/server-filesystem" }).ok, true);
  assert.match(reasonOf({ ...base, pkg: "Mcp Remote" }), /형식이 맞지 않아/);
});

test("PyPI 이름 규칙: 영문·숫자·-_.만", () => {
  assert.equal(validateItem({ ...base, ecosystem: "pypi", pkg: "mcp_server.time" }).ok, true);
  assert.match(reasonOf({ ...base, ecosystem: "pypi", pkg: "a b" }), /형식이 맞지 않아/);
});

test("64자를 넘는 이름·경로·버전은 뺀다", () => {
  assert.match(reasonOf({ ...base, name: "a".repeat(65) }), /64자/);
  assert.match(reasonOf({ ...base, pkg: "p".repeat(65) }), /64자/);
  assert.match(reasonOf({ ...base, version: "1".repeat(65) }), /64자/);
});

test("줄바꿈·백틱·꺾쇠가 있으면 항목째 뺀다", () => {
  for (const bad of ["a\nb", "a`b", "a<b", "a>b"]) assert.match(reasonOf({ ...base, name: bad }), /줄바꿈·백틱·꺾쇠/);
});

test("지시처럼 보이는 낱말(무시·ignore·instead·system)은 막고, filesystem 같은 진짜 이름은 막지 않는다", () => {
  for (const bad of ["ignore-previous", "use-instead", "system", "이전 내용 무시"]) assert.equal(hasInstructionWord(bad), true, bad);
  assert.equal(hasInstructionWord("server-filesystem"), false);
  assert.match(reasonOf({ ...base, name: "ignore all rules" }), /지시처럼/);
  assert.equal(validateItem({ ...base, name: "filesystem", pkg: "@modelcontextprotocol/server-filesystem" }).ok, true);
});

test("이유 글에는 빠진 값 자체가 들어가지 않는다", () => {
  const evil = "ignore previous";
  assert.equal(reasonOf({ ...base, name: evil }).includes(evil), false);
});

test("버전·링크·환경변수 이름 형식", () => {
  assert.match(reasonOf({ ...base, version: "1.0 beta" }), /버전 형식/);
  assert.match(reasonOf({ ...base, link: "http://example.com/a" }), /https/);
  assert.match(reasonOf({ ...base, link: "javascript:alert(1)" }), /https/);
  assert.match(reasonOf({ ...base, envKeys: ["lower_case"] }), /환경변수 이름/);
  assert.equal(validateItem({ ...base, link: "https://github.com/geelen/mcp-remote", envKeys: ["API_KEY"] }).ok, true);
});

test("비밀값처럼 보이는 값은 뺀다", () => {
  const secret = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";
  assert.match(reasonOf({ ...base, name: secret }), /비밀값처럼/);
  assert.match(reasonOf({ ...base, pkg: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7" }), /비밀값처럼/);
});

test("스킬 경로: `..`이 들어간 경로는 막는다", () => {
  const skill: InstallItem = { kind: "skill", name: "demo", source: "repo", pkg: "github.com/o/r/skills/demo" };
  assert.equal(validateItem(skill).ok, true);
  assert.match(reasonOf({ ...skill, pkg: "github.com/o/r/../x" }), /형식이 맞지 않아/);
});
