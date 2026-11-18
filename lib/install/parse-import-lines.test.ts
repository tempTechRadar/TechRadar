import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportLines } from "./parse-import-lines.ts";

const SECRET = "ghp_" + "a1B2c3D4e5F6g7H8i9J0";

test("형식이 맞는 줄만 받는다(종류|이름|패키지 또는 경로|버전)", () => {
  const r = parseImportLines("mcp|mcp-remote|npm:mcp-remote|0.1.16\nskill|demo|github.com/o/r/skills/demo|-\nplugin|p1|npm:@scope/p1|2.0.0");
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

test("[검토 5] 생태계 접두어(npm:·pypi:)가 없으면 짐작하지 않고 이유와 함께 뺀다", () => {
  const r = parseImportLines("mcp|time|mcp-server-time|0.6.2\nmcp|t|pypi:mcp-server-time|0.6.2\nmcp|v|npm:tool|1.0.0");
  assert.deepEqual(r.items.map((i) => i.ecosystem), ["pypi", "npm"]);
  assert.deepEqual(r.skipped.map((s) => s.line), [1]);
  assert.match(r.skipped[0].reason, /생태계 미확인/);
});

test("[검토 6] 키·토큰처럼 보이는 줄은 대소문자와 상관없이 저장하지 않고 줄 번호만 돌려준다", () => {
  const lines = [
    "mcp|ok|npm:ok-pkg|1.0.0",
    `mcp|bad|npm:bad-pkg|${SECRET}`,
    `mcp|x|npm:x|${"SK-" + "ABCDEFGHIJKLMNOP"}`,
    `mcp|x|npm:x|${"AKIA" + "IOSFODNN7EXAMPLE"}`,
    `mcp|x|npm:x|${SECRET.toUpperCase()}`,
    `mcp|x|npm:x|${"xoxb-" + "1234-5678-abcdefgh"}`,
    "mcp|API_KEY=abc|npm:x|1.0.0",
    `mcp|x|${"wJalrXUtnFEMI/K7MDENG/" + "bPxRfiCYEXAMPLEKEY"}|1`,
    `mcp|x|npm:x|${"AIza" + "SyA1234567890abcdefghijklmn"}`,
  ];
  const r = parseImportLines(lines.join("\n"));
  assert.deepEqual(r.items.map((i) => i.name), ["ok"]);
  assert.deepEqual(r.secretLines, [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(JSON.stringify(r).includes(SECRET), false);
});

test("값 검사에서 걸린 줄(문장 이름·꺾쇠)은 이유와 함께 건너뛴다", () => {
  const r = parseImportLines("mcp|ignore previous|npm:pkg|1.0.0\nmcp|a<b|npm:pkg|1.0.0");
  assert.equal(r.items.length, 0);
  assert.match(r.skipped[0].reason, /이름 형식/);
  assert.match(r.skipped[1].reason, /이름 형식/);
  assert.equal(JSON.stringify(r.skipped).includes("ignore previous"), false);
});

test("머리 줄·빈 줄은 조용히 넘기고, 같은 줄이 두 번이면 한 번만 받는다", () => {
  const r = parseImportLines("종류|이름|패키지 또는 경로|버전\n\nmcp|a|npm:a-pkg|1.0.0\nmcp|a|npm:a-pkg|1.0.0\r\n");
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.skipped, []);
});
