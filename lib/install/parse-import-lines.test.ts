import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportLines } from "./parse-import-lines.ts";

const SECRET = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

test("형식이 맞는 줄만 받는다(종류|이름|패키지 또는 경로|버전)", () => {
  const r = parseImportLines("mcp|mcp-remote|mcp-remote|0.1.16\nskill|demo|github.com/o/r/skills/demo|-\nplugin|p1|@scope/p1|2.0.0");
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.items[0], { kind: "mcp", name: "mcp-remote", source: "import", version: "0.1.16", ecosystem: "npm", pkg: "mcp-remote" });
  assert.equal(r.items[1].version, null);
  assert.deepEqual(r.skipped, []);
  assert.deepEqual(r.secretLines, []);
});

test("형식이 어긋난 줄은 건너뛰고 번호와 이유를 준다", () => {
  const r = parseImportLines("mcp|a|a\n그냥 설명 한 줄입니다\nfoo|a|a|1.0\nmcp||a|1.0");
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.skipped.map((s) => s.line), [1, 2, 3, 4]);
  assert.match(r.skipped[0].reason, /4칸/);
  assert.match(r.skipped[2].reason, /종류는/);
  assert.match(r.skipped[3].reason, /비어 있어요/);
});

test("키·토큰처럼 보이는 줄은 저장하지 않고 줄 번호만 돌려준다", () => {
  const random = "a1".repeat(20);
  const r = parseImportLines(`mcp|ok|ok-pkg|1.0.0\nmcp|bad|bad-pkg|${SECRET}\nmcp|x|${"sk-" + "abcdefghij1234567890"}|1.0\nmcp|y|${random}|1.0`);
  assert.deepEqual(r.items.map((i) => i.name), ["ok"]);
  assert.deepEqual(r.secretLines, [2, 3, 4]);
  assert.equal(JSON.stringify(r).includes(SECRET), false);
});

test("값 검사에서 걸린 줄(지시 낱말·꺾쇠)은 이유와 함께 건너뛴다", () => {
  const r = parseImportLines("mcp|ignore previous|pkg|1.0\nmcp|a<b|pkg|1.0");
  assert.equal(r.items.length, 0);
  assert.match(r.skipped[0].reason, /지시처럼/);
  assert.match(r.skipped[1].reason, /꺾쇠/);
  assert.equal(JSON.stringify(r.skipped).includes("ignore previous"), false);
});

test("머리 줄·빈 줄은 조용히 넘기고, 같은 줄이 두 번이면 한 번만 받는다", () => {
  const r = parseImportLines("종류|이름|패키지 또는 경로|버전\n\nmcp|a|a-pkg|1.0.0\nmcp|a|a-pkg|1.0.0\r\n");
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.skipped, []);
});

test("npm:·pypi: 접두어를 따르고, 없으면 이름 모양으로 정한다", () => {
  const r = parseImportLines("mcp|t|pypi:mcp-server-time|1.0\nmcp|u|Some_Pkg|1.0\nmcp|v|npm:tool|1.0");
  assert.deepEqual(r.items.map((i) => i.ecosystem), ["pypi", "pypi", "npm"]);
});
